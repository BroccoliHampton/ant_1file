const TOOLS = [
  { id: 'draw',    label: 'DRAW'  },
  { id: 'erase',   label: 'ERASE' },
  { id: 'sun',     label: '☀ SUN' },
  { id: 'stamp',   label: '⬛'    },
  { id: 'observe', label: '👁'    },
  { id: 'grab',    label: '✋'    },
]

export default function ToolRow({ activeTool, onToolChange }) {
  return (
    <div id="tool-row">
      {TOOLS.map(t => (
        <button
          key={t.id}
          className={`tbtn${activeTool === t.id ? ' active' : ''}`}
          onClick={() => onToolChange(t.id)}
          data-tool={t.id}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
