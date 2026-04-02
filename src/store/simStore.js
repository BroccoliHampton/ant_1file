import { create } from 'zustand'

export const useSimStore = create((set, get) => ({
  // Sim state (updated by engine each tick)
  tick: 0,
  era: 'PRIMORDIAL',
  narrator: '',
  populations: {},
  ecosystemStats: {},
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
