/* eslint-disable react/no-unescaped-entities */
import { useState } from 'react'

/**
 * Brand toolkit showcase. Loaded when the URL has ?ufshow=1.
 * Lets you preview every chrome / rainbow / neon utility in one place
 * before applying the brand to actual game UI.
 */
export default function UltraficheShowcase({ onClose }) {
  const [pulse, setPulse] = useState(true)

  return (
    <div className="uf-void-bg" style={{ minHeight: '100%', overflowY: 'auto', padding: '24px 18px' }}>
      <button
        onClick={onClose}
        className="uf-chrome-disc uf-pressable"
        style={{ position: 'absolute', top: 14, right: 14, zIndex: 5 }}
      >✕</button>

      {/* HERO */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <h1 className="uf-chunky uf-chrome-text uf-display-xl">
          ALIEN ANT FARM
        </h1>
        <span className="uf-rainbow-bar" />
        <p className="uf-label uf-silver-text uf-label-md" style={{ marginTop: 6 }}>
          BRAND TOOLKIT · v0
        </p>
      </div>

      {/* CHROME TEXT VARIANTS */}
      <Section label="CHROME TYPOGRAPHY">
        <h2 className="uf-chunky uf-chrome-text uf-display-lg" style={{ display:'block', marginBottom: 10 }}>
          PRIMORDIAL
        </h2>
        <h3 className="uf-chunky uf-chrome-text uf-display-md" style={{ display:'block', marginBottom: 8 }}>
          MISSION CONTROL
        </h3>
        <p className="uf-label uf-silver-text uf-label-md" style={{ marginBottom: 4 }}>
          / EH-LEE-EN ANT FARM /
        </p>
        <p className="uf-label uf-silver-text uf-label-sm">
          120 × 200 GRID · LIVE SIMULATION
        </p>
      </Section>

      {/* CHROME PANELS */}
      <Section label="CHROME PANELS">
        <div className="uf-chrome-panel" style={{ padding: 18, marginBottom: 12 }}>
          <p className="uf-chunky" style={{ color: '#eee', fontSize: 13, marginBottom: 4 }}>
            ECOSYSTEM STATUS
          </p>
          <p className="uf-label uf-silver-text uf-label-sm">12 SPECIES · 4 QUEENS</p>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <span className="uf-chrome-pill">🐜 ANTS · 45</span>
          <span className="uf-chrome-pill">🕷 SPIDERS · 12</span>
          <span className="uf-chrome-pill">🐝 WASPS · 3</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="uf-chrome-disc uf-pressable">⚙</button>
          <button className="uf-chrome-disc uf-pressable">⏸</button>
          <button className="uf-chrome-disc uf-pressable">🔄</button>
        </div>
      </Section>

      {/* RAINBOW BUTTONS */}
      <Section label="RAINBOW HERO BUTTONS">
        <button
          className={`uf-rainbow-rim uf-pressable ${pulse ? 'uf-rainbow-rim-pulse' : ''}`}
          style={{ display: 'block', width: '100%', height: 62, fontSize: 22, color: '#fff', marginBottom: 10 }}
        >
          <span className="uf-chunky uf-chrome-text" style={{ fontSize: 26, letterSpacing: '0.18em' }}>SEED LIFE</span>
        </button>
        <button
          className="uf-chrome-panel uf-pressable"
          style={{ display: 'block', width: '100%', height: 48, fontSize: 16, color: '#fff' }}
        >
          <span className="uf-chunky uf-silver-text" style={{ fontSize: 16, letterSpacing: '0.18em' }}>OPEN LAB</span>
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, color: '#aaa', fontSize: 11 }}>
          <input type="checkbox" checked={pulse} onChange={e => setPulse(e.target.checked)} />
          pulse the hero
        </label>
      </Section>

      {/* NEON GLOW SHOWCASE */}
      <Section label="OUTRUN NEON · CRT BLOOM">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          {[
            ['magenta', 'MAGENTA'],
            ['cyan',    'CYAN'],
            ['yellow',  'YELLOW'],
            ['green',   'GREEN'],
            ['violet',  'VIOLET'],
          ].map(([k, label]) => (
            <span
              key={k}
              className={`uf-chunky uf-neon-text-${k}`}
              style={{ fontSize: 14, letterSpacing: '0.15em' }}
            >{label}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['magenta', 'cyan', 'green'].map(k => (
            <div
              key={k}
              className={`uf-neon-stroke-${k}`}
              style={{
                padding: '8px 14px', borderRadius: 8,
                background: 'rgba(0,0,0,0.5)', color: '#fff',
                fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.12em',
              }}
            >
              {k.toUpperCase()} STROKE
            </div>
          ))}
        </div>
      </Section>

      {/* MIXED EXAMPLE */}
      <Section label="EXAMPLE — STAGE TILE">
        <div className="uf-chrome-panel" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <button className="uf-chrome-disc uf-pressable" style={{ fontSize: 18 }}>🌱</button>
            <div style={{ flex: 1 }}>
              <p className="uf-chunky" style={{ color: '#fff', fontSize: 14, marginBottom: 2 }}>TERRA</p>
              <p className="uf-label uf-silver-text uf-label-sm">LOCAL AI · ONLINE</p>
            </div>
            <span className="uf-chrome-pill uf-neon-text-green" style={{ fontSize: 9 }}>● ACTIVE</span>
          </div>
          <p style={{ color: '#bbb', fontSize: 11, lineHeight: 1.5 }}>
            "Your terrarium is going strong — 45 ants, 12 spiders, 3 wasps. Plant
            biomass is high; fungi could use a boost in the dark zones."
          </p>
        </div>
      </Section>

      <p className="uf-label uf-silver-text uf-label-sm" style={{ textAlign: 'center', marginTop: 24, opacity: 0.5 }}>
        END OF TOOLKIT · ?ufshow=0 to exit
      </p>
    </div>
  )
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h4 className="uf-label uf-silver-text uf-label-sm"
          style={{ marginBottom: 10, opacity: 0.7 }}>
        — {label} —
      </h4>
      {children}
    </div>
  )
}
