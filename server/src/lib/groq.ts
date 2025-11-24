// server/src/lib/groq.ts
/**
 * Groq helper using the OpenAI-compatible endpoints.
 * Exports:
 *  - ping(): debug endpoint/key
 *  - summarizeText(fullText): returns a short summary string (uses Groq if configured, else fallback)
 */

const GROQ_KEY = process.env.GROQ_API_KEY
const GROQ_MODEL = process.env.GROQ_MODEL || 'groq/compound'
const GROQ_BASE_URL = (process.env.GROQ_BASE_URL || 'https://api.groq.com').replace(/\/+$/, '')

if (!GROQ_KEY) {
  console.warn('GROQ: GROQ_API_KEY not set in env — Groq calls will be skipped (fallback will be used).')
}

type PingResult = { ok: boolean; status: number; host: string; body: any }

export async function ping(): Promise<PingResult> {
  if (!GROQ_KEY) throw new Error('Missing GROQ_API_KEY in environment')
  const url = `${GROQ_BASE_URL}/openai/v1/chat/completions`
  try {
    const resp = await globalThis.fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: 'user', content: 'ping' }] })
    })
    const text = await resp.text()
    let parsed: any = text
    try { parsed = JSON.parse(text) } catch {}
    return { ok: resp.ok, status: resp.status, host: GROQ_BASE_URL, body: parsed }
  } catch (err) {
    throw new Error('Ping failed: ' + ((err as any).message || err))
  }
}

export async function summarizeText(fullText: string): Promise<string> {
  const trimmed = (fullText || '').trim()
  if (!trimmed) return '[SUMMARY]\n(no transcript content)'

  if (!GROQ_KEY) return fallbackSummarizer(trimmed)

  const url = `${GROQ_BASE_URL}/openai/v1/chat/completions`
  const systemPrompt = `You are a concise summarizer. Produce a short summary (2-6 lines) capturing key points, action items and decisions.`
  const userPrompt = `Transcript:\n\n${trimmed}\n\nGive a brief summary and 1-3 action items.`

  const body = {
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.2,
    max_tokens: 400,
    top_p: 1.0
  }

  try {
    const resp = await globalThis.fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    const text = await resp.text()
    let parsed: any = {}
    try { parsed = JSON.parse(text) } catch { parsed = { raw: text } }

    // parse the common response shapes
    if (parsed && parsed.choices && Array.isArray(parsed.choices) && parsed.choices[0]) {
      const c0 = parsed.choices[0]
      if (c0.message && typeof c0.message.content === 'string') return c0.message.content.trim()
      if (typeof c0.text === 'string') return c0.text.trim()
      if (c0.delta && typeof c0.delta.content === 'string') return c0.delta.content.trim()
    }

    if (parsed && typeof parsed.output === 'string') return parsed.output.trim()
    if (parsed && typeof parsed.result === 'string') return parsed.result.trim()
    if (parsed && parsed.raw && typeof parsed.raw === 'string') return excerptFromString(parsed.raw)

    return fallbackSummarizer(trimmed)
  } catch (err) {
    console.warn('Groq summarize failed, using local fallback:', (err as any).message || err)
    return fallbackSummarizer(trimmed)
  }
}

function fallbackSummarizer(fullText: string): string {
  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean)
  const firstN = lines.slice(0, 6).join('\n')
  const summary = [
    '[SUMMARY]',
    'This is a fallback summary generated locally.',
    `Total lines in transcript: ${lines.length}`,
    '',
    'Preview:',
    firstN || '(no transcript content)'
  ].join('\n')
  return summary
}

function excerptFromString(s: string, max = 800) {
  const cleaned = s.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= max) return cleaned
  return cleaned.slice(0, max) + '...'
}
