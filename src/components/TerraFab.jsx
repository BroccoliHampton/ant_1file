/**
 * TerraFab — always-visible chrome FAB to summon Terra.
 *
 * Behavior:
 *   - Tap (short press): toggle the Terra chat panel
 *   - Long-press + drag (350ms+): reposition the FAB anywhere on screen
 *   - Position persists across reloads via localStorage
 *
 * Visual: silver chrome disc, optional green neon pulse when there's
 * unread Terra output (Phase 5 will wire that flag).
 *
 * Position model: anchored relative to the viewport using inset percentages
 * so the FAB stays usable across screen sizes (and across the upcoming
 * iOS-shell removal).
 */
import { useEffect, useRef, useState } from 'react'
import { useSimStore } from '../store/simStore.js'

const STORAGE_KEY = 'pt_terra_fab_pos_v1'
const LONG_PRESS_MS = 350

function loadPos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (typeof p?.right === 'number' && typeof p?.top === 'number') return p
  } catch {}
  return null
}

function savePos(p) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)) } catch {}
}

export default function TerraFab() {
  const open = useSimStore(s => s.terraOpen)
  const setOpen = useSimStore(s => s.setTerraOpen)
  const hasUnread = useSimStore(s => s.terraHasUnread || false)

  // Position is stored as { right, top } in CSS pixels relative to the
  // closest positioned ancestor (#app). Default = a bit above center,
  // pinned to the right edge.
  const [pos, setPos] = useState(() => loadPos() || { right: 8, top: null })
  const [dragging, setDragging] = useState(false)

  const btnRef = useRef(null)
  const pressTimer = useRef(null)
  const pointerDownAt = useRef(0)
  const startPointer = useRef({ x: 0, y: 0 })
  const startPos = useRef({ right: 0, top: 0 })
  // We engage drag mode only after the long-press timer fires
  const dragArmed = useRef(false)

  // Save position whenever it settles
  useEffect(() => {
    if (!dragging && pos) savePos(pos)
  }, [pos, dragging])

  // Compute the actual top in pixels for rendering. If pos.top is null,
  // default to ~52% of parent's height (centered vertically-ish).
  const styleTop = pos.top != null ? `${pos.top}px` : '52%'
  const styleTransform = pos.top != null ? 'none' : 'translateY(-50%)'

  function clearTimer() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  function onPointerDown(e) {
    pointerDownAt.current = Date.now()
    startPointer.current = { x: e.clientX, y: e.clientY }
    // Capture starting position in *pixels* relative to parent
    const parent = btnRef.current?.offsetParent
    const rect = btnRef.current?.getBoundingClientRect()
    const parentRect = parent?.getBoundingClientRect()
    if (rect && parentRect) {
      startPos.current = {
        right: parentRect.right - rect.right,
        top:   rect.top - parentRect.top,
      }
    }
    dragArmed.current = false
    pressTimer.current = setTimeout(() => {
      dragArmed.current = true
      setDragging(true)
      // Capture pointer so we keep getting moves outside the button
      try { e.target.setPointerCapture(e.pointerId) } catch {}
    }, LONG_PRESS_MS)
  }

  function onPointerMove(e) {
    if (!dragArmed.current) {
      // If user drags before the long-press fires, we treat it as a
      // tap-cancel — don't start dragging mid-tap. Cancel the timer.
      const dx = e.clientX - startPointer.current.x
      const dy = e.clientY - startPointer.current.y
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) clearTimer()
      return
    }
    e.preventDefault()
    const dx = e.clientX - startPointer.current.x
    const dy = e.clientY - startPointer.current.y
    const parent = btnRef.current?.offsetParent
    if (!parent) return
    const parentRect = parent.getBoundingClientRect()

    // Bounded movement — keep the FAB fully within #app
    const btnSize = 44
    const margin = 4
    const maxRight = parentRect.width - btnSize - margin
    const maxTop   = parentRect.height - btnSize - margin

    const nextRight = Math.min(maxRight, Math.max(margin, startPos.current.right - dx))
    const nextTop   = Math.min(maxTop,   Math.max(margin, startPos.current.top   + dy))

    setPos({ right: nextRight, top: nextTop })
  }

  function onPointerUp(e) {
    clearTimer()
    const wasDragging = dragArmed.current
    dragArmed.current = false
    setDragging(false)
    try { e.target.releasePointerCapture?.(e.pointerId) } catch {}

    // If we never entered drag mode, treat as a tap → toggle Terra
    if (!wasDragging) {
      const heldDur = Date.now() - pointerDownAt.current
      // Only register a tap if the press was reasonably short and didn't
      // travel far (handled in onPointerMove cancelling the timer)
      if (heldDur < LONG_PRESS_MS) setOpen(!open)
    }
  }

  function onPointerCancel(e) {
    clearTimer()
    dragArmed.current = false
    setDragging(false)
  }

  return (
    <button
      ref={btnRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={`uf-chrome-disc ${hasUnread && !dragging ? 'uf-fab-pulse' : ''}`}
      aria-label="Open Terra chat (drag to move)"
      style={{
        position: 'absolute',
        right: pos.right,
        top: styleTop,
        transform: styleTransform,
        zIndex: 50,
        width: 44,
        height: 44,
        fontSize: 18,
        opacity: open && !dragging ? 0.5 : 1,
        cursor: dragging ? 'grabbing' : 'pointer',
        // Lift the FAB visually while dragging
        boxShadow: dragging
          ? '0 12px 28px rgba(0,0,0,0.85), 0 0 0 2px rgba(80,240,140,0.6)'
          : '0 6px 14px rgba(0,0,0,0.7)',
        transition: dragging ? 'none' : 'opacity 0.15s, box-shadow 0.18s',
        // Avoid native press-and-hold callouts and text selection on iOS
        WebkitTouchCallout: 'none',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      🌱
    </button>
  )
}
