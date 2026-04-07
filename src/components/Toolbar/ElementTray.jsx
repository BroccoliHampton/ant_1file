import { ELEMENTS } from '../../simulation/constants.js'

const MOBILE_CATS = {
  terrain: ['jelly','sand','clay','stone','ice','goldSand','whiteSand','salt','water','acid','oil','ash','smoke','steam','gunpowder','wall','fire','lava'],
  life:    ['worm','wood','ant','queen','spider','queenSpider','huntsman','queenHuntsman','termite','queenTermite','mite','queenMite','plant','seed','algae','detritus','fungi','spore'],
  special: ['machine','bacteria','rna1','rna2','rna3','mutagen','chromadust','cloud','bloomCloud','progCloud','progVoid'],
  rx:      ['lucid','crank'],
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
