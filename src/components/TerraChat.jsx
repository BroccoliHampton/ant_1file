import { useState, useRef, useEffect } from 'react'
import { loadTerra, chat, hasWebGPU, isLoaded, MODEL_ID } from '../agent/localLLM.js'

/**
 * TerraChat — chatbox-style panel for conversing with the local LLM.
 * First click of "Wake Terra" triggers the model download (~1GB, cached after).
 */
export default function TerraChat({ open, onClose }) {
  const [messages, setMessages] = useState([])           // [{role, content}]
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)          // model-load phase
  const [loadProgress, setLoadProgress] = useState(null) // { progress, text }
  const [thinking, setThinking] = useState(false)        // generating response
  const [ready, setReady] = useState(isLoaded())
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  // Auto-scroll to latest message
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, thinking, loadProgress])

  useEffect(() => {
    if (open && ready && inputRef.current) inputRef.current.focus()
  }, [open, ready])

  async function handleWake() {
    if (!hasWebGPU()) {
      setError('Your browser does not support WebGPU. Terra needs WebGPU to run locally. Try Chrome or Edge on desktop.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await loadTerra((p) => setLoadProgress(p))
      setReady(true)
      setMessages([{ role: 'assistant', content: "Hi! I'm Terra. I live inside your terrarium. I can chat — action powers coming soon. What's on your mind?" }])
    } catch (e) {
      console.error(e)
      setError(`Couldn't wake Terra: ${e.message || e}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || thinking) return
    setInput('')
    const nextHistory = [...messages, { role: 'user', content: text }]
    setMessages([...nextHistory, { role: 'assistant', content: '' }])
    setThinking(true)

    try {
      let buf = ''
      await chat(nextHistory, text, (delta) => {
        buf += delta
        setMessages(msgs => {
          const copy = msgs.slice(0, -1)
          copy.push({ role: 'assistant', content: buf })
          return copy
        })
      })
    } catch (e) {
      console.error(e)
      setMessages(msgs => {
        const copy = msgs.slice(0, -1)
        copy.push({ role: 'assistant', content: `[error: ${e.message || e}]` })
        return copy
      })
    } finally {
      setThinking(false)
    }
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!open) return null

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0, zIndex: 159,
          background: 'rgba(0,0,0,0.4)'
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: '8px', bottom: '8px',
          width: 'min(360px, 92vw)',
          height: 'min(560px, 80vh)',
          zIndex: 160,
          background: 'var(--menu-bg, #111)',
          border: '1px solid var(--btn-border, #333)',
          borderRadius: '10px',
          display: 'flex', flexDirection: 'column',
          fontFamily: 'var(--mono, monospace)',
          color: 'var(--text, #fff)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 12px',
          borderBottom: '1px solid var(--btn-border, #333)'
        }}>
          <span style={{ fontSize: '14px' }}>🌱</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', letterSpacing: '2px', color: 'var(--accent, #4f8)' }}>TERRA</div>
            <div style={{ fontSize: '8px', color: 'var(--dim, #888)' }}>
              {ready ? 'local ai · online' : loading ? 'loading model…' : 'asleep'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none',
              color: 'var(--dim, #888)', cursor: 'pointer', fontSize: '14px'
            }}
          >✕</button>
        </div>

        {/* Body */}
        <div
          ref={scrollRef}
          style={{
            flex: 1, overflowY: 'auto', padding: '10px 12px',
            fontSize: '11px', lineHeight: 1.5,
            display: 'flex', flexDirection: 'column', gap: '8px'
          }}
        >
          {!ready && !loading && !error && (
            <div style={{ textAlign: 'center', marginTop: '40px', color: 'var(--dim, #888)' }}>
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>💤</div>
              <div style={{ marginBottom: '16px', fontSize: '10px', lineHeight: 1.6 }}>
                Terra is a small AI that lives in your terrarium.<br />
                First wake downloads ~1GB. Cached after.
              </div>
              <button
                onClick={handleWake}
                style={{
                  padding: '8px 16px', fontSize: '10px', letterSpacing: '2px',
                  background: 'var(--accent, #4f8)', color: '#000',
                  border: 'none', borderRadius: '4px',
                  fontFamily: 'var(--mono, monospace)', cursor: 'pointer'
                }}
              >WAKE TERRA</button>
            </div>
          )}

          {loading && loadProgress && (
            <div style={{ marginTop: '40px', color: 'var(--dim, #888)', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', marginBottom: '10px' }}>🌱</div>
              <div style={{ fontSize: '10px', marginBottom: '8px' }}>{loadProgress.text || 'Loading…'}</div>
              <div style={{
                height: '4px', background: '#222', borderRadius: '2px',
                overflow: 'hidden', margin: '0 20px'
              }}>
                <div style={{
                  height: '100%',
                  width: `${Math.round((loadProgress.progress || 0) * 100)}%`,
                  background: 'var(--accent, #4f8)',
                  transition: 'width 0.3s'
                }} />
              </div>
            </div>
          )}

          {error && (
            <div style={{
              padding: '10px', background: 'rgba(255,80,80,0.1)',
              border: '1px solid rgba(255,80,80,0.4)', borderRadius: '4px',
              color: '#faa', fontSize: '10px'
            }}>{error}</div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                padding: '6px 10px',
                background: m.role === 'user'
                  ? 'rgba(68,136,255,0.15)'
                  : 'rgba(255,255,255,0.05)',
                border: `1px solid ${m.role === 'user' ? 'rgba(68,136,255,0.4)' : 'var(--btn-border, #333)'}`,
                borderRadius: '8px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}
            >
              {m.content || (m.role === 'assistant' && thinking ? '…' : '')}
            </div>
          ))}
        </div>

        {/* Input */}
        {ready && (
          <div style={{
            display: 'flex', gap: '6px', padding: '8px 10px',
            borderTop: '1px solid var(--btn-border, #333)'
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              disabled={thinking}
              placeholder={thinking ? 'Terra is thinking…' : 'ask Terra…'}
              style={{
                flex: 1, padding: '6px 8px', fontSize: '11px',
                background: 'var(--btn-bg, #222)',
                border: '1px solid var(--btn-border, #333)',
                color: 'var(--text, #fff)',
                borderRadius: '4px', fontFamily: 'var(--mono, monospace)',
                outline: 'none'
              }}
            />
            <button
              onClick={handleSend}
              disabled={thinking || !input.trim()}
              style={{
                padding: '6px 12px', fontSize: '10px', letterSpacing: '1px',
                background: thinking || !input.trim()
                  ? 'var(--btn-bg, #222)'
                  : 'var(--accent, #4f8)',
                color: thinking || !input.trim() ? 'var(--dim, #888)' : '#000',
                border: '1px solid var(--btn-border, #333)',
                borderRadius: '4px',
                fontFamily: 'var(--mono, monospace)',
                cursor: thinking || !input.trim() ? 'default' : 'pointer'
              }}
            >SEND</button>
          </div>
        )}
      </div>
    </>
  )
}
