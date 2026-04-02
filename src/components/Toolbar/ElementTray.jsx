import { ELEMENTS } from '../../simulation/constants.js'

const MOBILE_CATS = {
  terrain: ['sand','clay','stone','wood','ice','goldSand','whiteSand','salt','water','acid','oil','ash','smoke','steam','gunpowder','wall','fire','lava'],
  life:    ['ant','queen','spider','queenSpider','termite','queenTermite','mite','queenMite','plant','seed','algae','detritus','fungi','spore'],
  special: ['mutagen','cloud','bloomCloud','progCloud','progVoid'],
  rx:      ['stimulant','chromadust','nectar','venomBrew','pheromone','calcifier','sporeBomb','gigantism'],
}

export default function ElementTray({ activeCat, activeElement, onElementChange }) {
  const keys     = MOBILE_CATS[activeCat] || MOBILE_CATS.terrain
  const elements = keys.map(k => ELEMENTS.find(e => e.key === k)).filter(Boolean)

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
      </div>
    </div>
  )
}
