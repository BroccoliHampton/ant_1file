/**
 * TerraFab — always-visible right-edge floating action button to summon Terra.
 *
 * - Default: silver chrome disc, no glow
 * - When Terra has unread output (or notable ecosystem events): gentle green
 *   neon pulse to draw the eye
 * - Tap → opens the Terra chat panel
 *
 * Vertically positioned roughly between the status ribbon (top) and the
 * toolbar (bottom). Sits above all gameplay content.
 *
 * The unread-pulse hook is a no-op for now — Phase 5 will wire it to
 * actual Terra activity.
 */
import { useSimStore } from '../store/simStore.js'

export default function TerraFab() {
  const open = useSimStore(s => s.terraOpen)
  const setOpen = useSimStore(s => s.setTerraOpen)
  const hasUnread = useSimStore(s => s.terraHasUnread || false)

  return (
    <button
      onClick={() => setOpen(!open)}
      className={`uf-chrome-disc uf-pressable ${hasUnread ? 'uf-fab-pulse' : ''}`}
      aria-label="Open Terra chat"
      style={{
        position: 'absolute',
        right: 8,
        top: '52%',
        transform: 'translateY(-50%)',
        zIndex: 50,
        width: 44,
        height: 44,
        fontSize: 18,
        // When Terra is already open, dim the FAB slightly so it doesn't
        // compete with the chat panel's own header
        opacity: open ? 0.5 : 1,
        transition: 'opacity 0.15s ease',
      }}
    >
      🌱
    </button>
  )
}
