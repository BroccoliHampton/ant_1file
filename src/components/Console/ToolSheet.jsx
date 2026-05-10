/**
 * ToolSheet — slides up from the bottom when the Tool chip is tapped.
 *
 * Layout:
 *   ─ Tool chip row (DRAW · ERASE · SUN · STAMP · OBSERVE · GRAB)
 *   ─ Stamp shape picker (only visible when STAMP tool is active) — keeps
 *     the legacy `#stamp-picker` / `#stamp-sel` / `#stamp-hint` IDs the
 *     engine queries
 *   ─ Speed slider at bottom (with the legacy `sp` / `spv` IDs)
 *
 * The hero Play/Pause FAB (in Console) handles pause/resume + long-press
 * scrub-to-max — the slider is for granular speed control.
 */
import { useSimStore } from '../../store/simStore.js'

const TOOLS = [
  { id: 'draw',    icon: '✎',  label: 'DRAW' },
  { id: 'erase',   icon: '✕',  label: 'ERASE' },
  { id: 'sun',     icon: '☀',  label: 'SUN' },
  { id: 'stamp',   icon: '⬛', label: 'STAMP' },
  { id: 'observe', icon: '👁', label: 'OBSERVE' },
  { id: 'grab',    icon: '✋', label: 'GRAB' },
]

export default function ToolSheet({ open, onClose }) {
  const activeTool    = useSimStore(s => s.activeTool)
  const setActiveTool = useSimStore(s => s.setActiveTool)
  const speedMult     = useSimStore(s => s.speedMult)
  const setSpeedMult  = useSimStore(s => s.setSpeedMult)

  // Speed slider raw value: 0..20 → 0.0..4.0×
  const speedRaw   = Math.round(speedMult / 0.2)
  const speedLabel = speedMult === 0 ? 'PAUSED' : speedMult.toFixed(1) + '×'

  if (!open) return null

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 40,
          animation: 'uf-fade-in 0.2s ease',
        }}
      />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          maxHeight: '60%',
          background: 'var(--uf-void-deep, #000)',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '14px 14px 0 0',
          padding: '14px 12px 10px',
          display: 'flex', flexDirection: 'column', gap: 12,
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

        {/* Tools — 3 columns × 2 rows of chrome chips */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 6,
        }}>
          {TOOLS.map(t => (
            <ToolChip
              key={t.id}
              tool={t}
              active={activeTool === t.id}
              onClick={() => setActiveTool(t.id)}
            />
          ))}
        </div>

        {/* Stamp shape picker — engine queries #stamp-picker, #stamp-sel, #stamp-hint */}
        <div id="stamp-picker" style={{
          display: activeTool === 'stamp' ? 'block' : 'none',
          padding: '8px 10px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8,
        }}>
          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
            <span style={{fontSize:9,color:'#aaa',letterSpacing:'2px',fontWeight:700}}>STAMP</span>
            <select id="stamp-sel" style={{
              flex: 1, fontSize: 10, padding: '4px',
              background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff', borderRadius: 4, fontFamily: 'inherit',
            }}>
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
          <div id="stamp-hint" style={{
            display: 'none',
            fontSize: 8, color: '#aaa',
            marginTop: 4, paddingLeft: 2, fontStyle: 'italic',
          }}>Click + drag to draw box</div>
        </div>

        {/* Speed slider — keeps legacy IDs */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 4px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          marginTop: 4,
        }}>
          <span style={{ fontSize: 13 }}>⏱</span>
          <input
            id="sp"
            type="range" min="0" max="20" value={speedRaw}
            onChange={e => setSpeedMult(+e.target.value * 0.2)}
            style={{ flex: 1, accentColor: '#19e0f4' }}
          />
          <span id="spv" style={{
            fontSize: 10,
            fontWeight: 600,
            color: '#e0e0e2',
            minWidth: 56, textAlign: 'right',
          }}>{speedLabel}</span>
        </div>
      </div>
    </>
  )
}

function ToolChip({ tool, active, onClick }) {
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
        padding: '10px 4px',
        background: active
          ? 'linear-gradient(#2a2a2a, #0a0a0a) padding-box, var(--uf-gradient-rainbow-conic) border-box'
          : 'linear-gradient(#1a1a1a, #050505) padding-box, var(--uf-gradient-silver-vertical) border-box',
        border: '1.5px solid transparent',
        borderRadius: 10,
        cursor: 'pointer',
        boxShadow: active
          ? '0 0 12px rgba(250,63,140,0.3), 0 4px 8px rgba(0,0,0,0.6)'
          : '0 4px 8px rgba(0,0,0,0.6)',
        transition: 'box-shadow 0.18s',
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1 }}>{tool.icon}</span>
      <span style={{
        fontSize: 9,
        letterSpacing: '0.12em',
        fontWeight: 700,
        color: active ? '#fff' : 'rgba(255,255,255,0.65)',
      }}>{tool.label}</span>
    </button>
  )
}
