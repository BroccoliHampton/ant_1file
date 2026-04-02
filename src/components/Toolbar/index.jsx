import { useState } from 'react'
import { useSimStore } from '../../store/simStore.js'
import ToolRow from './ToolRow.jsx'
import CategoryTabs from './CategoryTabs.jsx'
import ElementTray from './ElementTray.jsx'
import ControlRow from './ControlRow.jsx'

export default function Toolbar() {
  const [activeCat, setActiveCat] = useState('terrain')

  // These now route through the store → engine
  const activeTool       = useSimStore(s => s.activeTool)
  const activeElement    = useSimStore(s => s.activeElement)
  const setActiveTool    = useSimStore(s => s.setActiveTool)
  const setActiveElement = useSimStore(s => s.setActiveElement)

  return (
    <div id="toolbar">
      <ToolRow      activeTool={activeTool}      onToolChange={setActiveTool} />
      <CategoryTabs activeCat={activeCat}        onCatChange={setActiveCat} />
      <ElementTray  activeCat={activeCat}        activeElement={activeElement} onElementChange={setActiveElement} />
      <ControlRow />
    </div>
  )
}
