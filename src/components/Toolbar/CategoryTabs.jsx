const CATS = [
  { id: 'terrain', label: 'TERRAIN' },
  { id: 'life',    label: 'LIFE'    },
  { id: 'special', label: 'SPECIAL' },
  { id: 'rx',      label: 'Rx'      },
]

export default function CategoryTabs({ activeCat, onCatChange }) {
  return (
    <div id="cat-tabs">
      {CATS.map(c => (
        <button
          key={c.id}
          className={`cat-tab${activeCat === c.id ? ' active' : ''}`}
          data-cat={c.id}
          onClick={() => onCatChange(c.id)}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}
