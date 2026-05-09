// Terra — local LLM runtime using @mlc-ai/web-llm
// Lazy-loads a small instruct model into the browser via WebGPU.
// Phase 1: chat-only, no tool calls yet. Live terrarium state is injected
// into the system prompt so Terra can answer grounded questions.

import { observeWorld } from './observeWorld.js'

let enginePromise = null
let engine = null

// Pick a small, capable instruct model. Qwen 2.5 3B is the sweet spot for
// tool use at small size, but it's ~1.8GB. Start smaller for quicker iteration.
// If you want to swap, change MODEL_ID and rebuild.
export const MODEL_ID = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'

const SYSTEM_PROMPT = `You are Terra, a friendly AI gardener living inside a falling-sand ecosystem simulation called Alien Ant Farm. You will be given a live snapshot of the terrarium right before each user message. You MUST answer based only on that snapshot.

Rules:
- Read the SNAPSHOT carefully and use the EXACT counts it gives. Do not invent or round numbers.
- If the snapshot says the terrarium is empty, say it's empty. Never pretend creatures exist that are not listed.
- If the user asks "how many X do I have?", find X in the snapshot and give that exact number. If X isn't in the snapshot, say "none".
- You cannot take actions yet — action tools are coming soon.
- Keep replies to 1–3 sentences unless asked for detail. Be warm and a little whimsical.

Food-web facts you can use for advice:
- Sun feeds plants. Plants feed ants and termites.
- Old plants slowly petrify into wood. Termites eat wood.
- Ants are eaten by spiders. Spiders are eaten by wasps.
- Wasps also eat eggs, detritus, and spider web.
- Fungi decompose wood and detritus and parasitize spiders.
- Every species has a queen. Workers tithe energy to their queen. Queens starve without workers.`


export async function loadTerra(onProgress) {
  if (engine) return engine
  if (enginePromise) return enginePromise

  enginePromise = (async () => {
    const { CreateMLCEngine } = await import('@mlc-ai/web-llm')
    engine = await CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (p) => {
        // p: { progress: 0..1, text: '...', timeElapsed }
        if (onProgress) onProgress(p)
      }
    })
    return engine
  })()

  return enginePromise
}

export function isLoaded() {
  return !!engine
}

/**
 * Stream a chat completion. Calls onDelta(textChunk) for each token batch.
 * Returns the full assembled response when done.
 */
export async function chat(history, userMsg, onDelta) {
  if (!engine) throw new Error('Terra not loaded yet')

  // Inject the state directly into the user turn — small models read the last
  // user message most reliably. System-prompt state tends to get ignored.
  const state = observeWorld()
  const augmentedUser = `SNAPSHOT of my terrarium right now:
${state}

My message: ${userMsg}`

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: augmentedUser }
  ]

  // Debug: expose last-sent payload so you can inspect in devtools
  if (typeof window !== 'undefined') {
    window.__terraLastPrompt = messages
    console.log('[Terra] state snapshot:\n' + state)
  }

  const stream = await engine.chat.completions.create({
    messages,
    stream: true,
    temperature: 0.5,
    max_tokens: 256,
  })

  let full = ''
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content || ''
    if (delta) {
      full += delta
      if (onDelta) onDelta(delta)
    }
  }
  return full
}

/**
 * Check if WebGPU is available — Terra won't run without it.
 */
export function hasWebGPU() {
  return typeof navigator !== 'undefined' && !!navigator.gpu
}
