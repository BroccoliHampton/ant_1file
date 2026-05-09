// observeWorld() — produce a compact, human-readable snapshot of the current
// terrarium state. This is injected into every Terra request so the LLM has
// real ground truth instead of hallucinating.

import { useSimStore } from '../store/simStore.js'
import { T } from '../simulation/constants.js'

// Species — mapped from numeric type ID (what POP uses) to display info
const LIVING = [
  { id: T.PLANT,    label: '🌱 Plants' },
  { id: T.WOOD,     label: '🪵 Wood' },
  { id: T.SEED,     label: '🌰 Seeds' },
  { id: T.FUNGI,    label: '🍄 Fungi' },
  { id: T.SPORE,    label: '🌫 Spores' },
  { id: T.ANT,      label: '🐜 Ants' },
  { id: T.TERMITE,  label: '🐛 Termites' },
  { id: T.SPIDER,   label: '🕷 Spiders' },
  { id: T.WASP,     label: '🐝 Wasps' },
  { id: T.WEB,      label: '🕸 Web' },
  { id: T.EGG,      label: '🥚 Eggs' },
  { id: T.DETRITUS, label: '💀 Detritus' },
  { id: T.ASH,      label: '◦ Ash' },
]

const QUEENS = [
  { id: T.QUEEN,         label: '👑 Queen Ant',     species: 'ants' },
  { id: T.QUEEN_SPIDER,  label: '👑 Queen Spider',  species: 'spiders' },
  { id: T.QUEEN_WASP,    label: '👑 Queen Wasp',    species: 'wasps' },
  { id: T.QUEEN_TERMITE, label: '👑 Queen Termite', species: 'termites' },
]

function countOf(pops, id) {
  return pops[id] || 0
}

function formatHealthFlags(pops) {
  const flags = []
  const ant = countOf(pops, T.ANT), spider = countOf(pops, T.SPIDER)
  const wasp = countOf(pops, T.WASP), termite = countOf(pops, T.TERMITE)
  const plant = countOf(pops, T.PLANT), fungi = countOf(pops, T.FUNGI)
  const qa = countOf(pops, T.QUEEN), qs = countOf(pops, T.QUEEN_SPIDER)
  const qw = countOf(pops, T.QUEEN_WASP), qt = countOf(pops, T.QUEEN_TERMITE)

  if (plant === 0) flags.push('no plants — ecosystem cannot sustain herbivores')
  if (ant > 0 && qa === 0) flags.push('ants have no queen — colony will not grow')
  if (spider > 0 && qs === 0) flags.push('spiders have no queen')
  if (wasp > 0 && qw === 0) flags.push('wasps have no queen')
  if (termite > 0 && qt === 0) flags.push('termites have no queen')
  if (wasp === 0 && qw === 0) flags.push('no wasps at all')
  if (spider === 0 && qs === 0) flags.push('no spiders at all')
  if (termite === 0 && qt === 0) flags.push('no termites at all')
  if (ant === 0 && qa === 0) flags.push('no ants at all')
  if (fungi === 0) flags.push('no fungi (decomposers absent)')
  if (plant > 0 && ant === 0 && termite === 0) flags.push('plants present but no herbivores eating them')
  if (ant > 200 && spider < 5) flags.push('ants unchecked — spider population may be too low')
  if (spider > 60 && wasp === 0) flags.push('spiders unchecked — no wasps to control them')
  return flags
}

export function observeWorld() {
  const s = useSimStore.getState()
  const { tick, era, populations, mutRate, entropyRate, speedMult } = s
  const pops = populations || {}

  const livingList = LIVING
    .map(spec => ({ ...spec, n: countOf(pops, spec.id) }))
    .filter(x => x.n > 0)
    .sort((a,b) => b.n - a.n)

  const queenList = QUEENS
    .map(q => ({ ...q, n: countOf(pops, q.id) }))
    .filter(x => x.n > 0)

  const flags = formatHealthFlags(pops)

  const lines = []
  lines.push(`TICK: ${tick} · ERA: ${era} · SPEED: ${speedMult}x · MUTATION: ${mutRate === 0 ? 'off' : (mutRate*100).toFixed(1)+'%'} · ENTROPY: ${entropyRate === 0 ? 'off' : Math.round(entropyRate*100)+'%'}`)

  if (livingList.length === 0) {
    lines.push('POPULATIONS: the terrarium is empty — no living organisms.')
  } else {
    lines.push('POPULATIONS:')
    for (const { label, n } of livingList) {
      lines.push(`  ${label}: ${n}`)
    }
  }

  if (queenList.length > 0) {
    lines.push('QUEENS:')
    for (const { label, n } of queenList) {
      lines.push(`  ${label}: ${n}`)
    }
  } else if (livingList.length > 0) {
    lines.push('QUEENS: none — no colonies can reproduce')
  }

  if (flags.length > 0) {
    lines.push('ECOSYSTEM NOTES:')
    for (const f of flags) lines.push(`  - ${f}`)
  }

  return lines.join('\n')
}

// For debugging — expose helpers so you can inspect in devtools:
//   __terraPeek()       → see the text snapshot Terra gets
//   __terraRawPops()    → see the raw populations object from the store
if (typeof window !== 'undefined') {
  window.__terraPeek = () => {
    const out = observeWorld()
    console.log(out)
    return out
  }
  window.__terraRawPops = () => {
    const s = useSimStore.getState()
    console.log('populations object:', s.populations)
    console.log('T.ANT =', T.ANT, 'pops[T.ANT] =', s.populations?.[T.ANT])
    console.log('T.PLANT =', T.PLANT, 'pops[T.PLANT] =', s.populations?.[T.PLANT])
    return s.populations
  }
}
