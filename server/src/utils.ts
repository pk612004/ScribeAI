// server/src/utils.ts
import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import { tmpdir } from 'os'
import { webmToLinear16 } from './ffmpeg'
import { GeminiLiveClient, summarizeText } from './lib/groq'

const base = path.join(tmpdir(), 'scribeai_chunks')

// create the base dir synchronously at module load so we avoid top-level await
try {
  fs.mkdirSync(base, { recursive: true })
} catch (e) {
  // ignore
}

export async function saveChunkToTemp(sessionId: string, index: number, buffer: Buffer) {
  const dir = path.join(base, String(sessionId))
  await fsPromises.mkdir(dir, { recursive: true })
  const file = path.join(dir, `${String(index).padStart(5, '0')}.webm`)
  await fsPromises.writeFile(file, buffer)
  return file
}

// processChunkBuffer: convert webm->linear16 then stream to Gemini Live WS
export async function processChunkBuffer(sessionId: string, index: number, buffer: Buffer) {
  try {
    const wav = await webmToLinear16(buffer)
    if (!(global as any).__geminiClients) (global as any).__geminiClients = new Map()
    const clients: Map<string, any> = (global as any).__geminiClients
    let client = clients.get(sessionId)
    if (!client) {
      client = new GeminiLiveClient({ sessionId })
      await client.connect()
      // wire events (persist/broadcast in real app)
      client.on('transcript', (msg: any) => {
        // placeholder: in production broadcast to sockets & save segments
        console.log('gemini partial transcript for', sessionId, msg)
      })
      clients.set(sessionId, client)
    }
    // send linear16 WAV buffer as realtime audio frame (gemini wrapper base64-encodes)
    await client.sendAudioFrame(wav, { mimeType: 'audio/wav' })
    return { sessionId, index, text: `[segment ${index}] (sent to Gemini)`, startMs: index * 10000, endMs: (index + 1) * 10000 }
  } catch (err) {
    console.error('processChunkBuffer error', err)
    return { sessionId, index, text: `[segment ${index}] (conversion/stream error)` }
  }
}

// finalizeSession: close gemini client, aggregate saved chunks, and call summarizer
export async function finalizeSession(sessionId: string) {
  const dir = path.join(base, String(sessionId))
  const files = await fsPromises.readdir(dir).catch(() => [])
  const parts = files.sort().map((f) => `[${f}]`).join('\n')
  const clients: Map<string, any> = (global as any).__geminiClients || new Map()
  const client = clients.get(sessionId)
  if (client) {
    try { await client.sendAudioStreamEnd() } catch (e) { /*ignore*/ }
    try { await client.close() } catch (e) { /*ignore*/ }
    clients.delete(sessionId)
  }
  const transcript = `AGGREGATED TRANSCRIPT (simulated)\n${parts}`
  const summary = await summarizeText(transcript)
  return { transcript, summary }
}
