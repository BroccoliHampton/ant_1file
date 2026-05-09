import { ELEMENTS } from '../../simulation/constants.js'
import { useSimStore } from '../../store/simStore.js'

const MOBILE_CATS = {
  terrain: ['jelly','sand','clay','stone','ice','goldSand','whiteSand','salt','water','acid','oil','ash','smoke','steam','gunpowder','wall','fire','lava'],
  life:    ['worm','wood','ant','queen','spider','queenSpider','termite','queenTermite','wasp','queenWasp','plant','seed','detritus','fungi','spore'],
  special: ['machine','bacteria','quark','rna1','fractal1','fractal2','customelem_1','customelem_2','mutagen','chromadust','cloud','bloomCloud','progCloud','progVoid'],
  rx:      ['lucid','crank','flaca'],
}

export default function ElementTray({ activeCat, activeElement, onElementChange }) {
  const keys     = MOBILE_CATS[activeCat] || MOBILE_CATS.terrain
  const elements = keys.map(k => ELEMENTS.find(e => e.key === k)).filter(Boolean)

  // User-saved custom elements appear at the end of the Special tab. Subscribe
  // to customElementsVersion so saving/deleting in the lab refreshes the tray.
  const engine = useSimStore(s => s.engine)
  const _ver = useSimStore(s => s.customElementsVersion)
  const userElements = (activeCat === 'special' && engine)
    ? engine.listCustomElements({ userOnly: true })
    : []

  return (
    <div id="element-tray-outer">
      <div id="element-tray">
        {elements.map(e => (
          <button
            key={e.key}
            className={`tray-pill${activeElement === e.key ? ' active' : ''}`}
            data-el={e.key}
            onClick={() => onElementChange(e.key)}
          >
            <span className="tp-swatch" style={{background: e.col}} />
            <span className="tp-name">{e.label}</span>
          </button>
        ))}
        {userElements.map(d => {
          const key = `customelem_${d.id}`
          const col = `hsl(${d.hue}, ${d.sat}%, ${d.lit}%)`
          return (
            <button
              key={key}
              className={`tray-pill${activeElement === key ? ' active' : ''}`}
              data-el={key}
              onClick={() => onElementChange(key)}
            >
              <span className="tp-swatch" style={{background: col}} />
              <span className="tp-name">{d.name?.toUpperCase() || `ELEM ${d.id}`}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
