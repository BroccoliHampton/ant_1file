import { create } from 'zustand'

export const useSimStore = create((set, get) => ({
  // Sim state (updated by engine each tick)
  tick: 0,
  era: 'PRIMORDIAL',
  narrator: '',
  populations: {},
  ecosystemStats: {},
  machineGen: 0,
  machineBest: 0,
  machineRunning: false,
  machineCountdown: null,
  hasMachineCells: false,
  bacteriaGen: 0,
  bacteriaBest: 0,
  bacteriaRunning: false,
  bacteriaCountdown: null,
  hasBacteriaCells: false,
  menuOpen: false,
  setMenuOpen: (val) => set({ menuOpen: val }),
  startGoL:    () => get().engine?.startGoL(),
  stopGoL:     () => get().engine?.stopGoL(),
  stopBacteria:() => get().engine?.stopBacteria(),
  reset:     () => get().engine?.reset(),
  seed:      () => get().engine?.seed(),
  randomMap: () => get().engine?.randomMap(),
  openLab:   () => get().engine?.openLab(),
  setState: (updates) => set(updates),

  // Engine reference — set once by CanvasZone on mount
  engine: null,
  setEngine: (engine) => set({ engine }),

  // Active tool/element — synced to both React UI and engine
  activeTool: 'draw',
  activeElement: 'sand',
  setActiveTool: (tool) => {
    set({ activeTool: tool })
    get().engine?.setTool(tool)
  },
  setActiveElement: (key) => {
    set({ activeElement: key, activeTool: 'draw' })
    get().engine?.setElement(key)
    get().engine?.setTool('draw')
  },

  // Mutation rate — synced to engine
  mutRate: 0,
  setMutRate: (r) => {
    set({ mutRate: r })
    get().engine?.setMutRate(r)
  },

  // Entropy rate — chaos event frequency
  entropyRate: 0,
  setEntropyRate: (r) => {
    set({ entropyRate: r })
    get().engine?.setEntropyRate(r)
  },

  // Brush & speed — synced to engine
  brushSize: 3,
  speedMult: 1,
  setBrushSize: (v) => {
    set({ brushSize: v })
    get().engine?.setBrushSize(v)
  },
  setSpeedMult: (v) => {
    set({ speedMult: v })
    get().engine?.setSpeed(v)
  },
}))
