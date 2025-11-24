// server/src/recordingSocket.ts
import { Server, Socket } from 'socket.io'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { webmToLinear16 } from './ffmpeg'
import util from 'util'
import crypto from 'crypto'

const writeFile = util.promisify(fs.writeFile)
const readFile = util.promisify(fs.readFile)
const appendFile = util.promisify(fs.appendFile)
const readdir = util.promisify(fs.readdir)

/**
 * Helper: deterministic safe filename for sessionId (same idea as sessionApi)
 */
function safeName(sessionId: string) {
  const id = String(sessionId ?? 'unnamed')
  const base = Buffer.from(id, 'utf8').toString('base64url')
  const short = crypto.createHash('sha1').update(id).digest('hex').slice(0, 8)
  return `${base}_${short}`
}

/**
 * Where we store raw chunk files
 */
const BASE_CHUNKS_DIR = path.join(os.tmpdir(), 'scribeai_chunks')
if (!fs.existsSync(BASE_CHUNKS_DIR)) fs.mkdirSync(BASE_CHUNKS_DIR, { recursive: true })

/**
 * Minimal transcription function (mock)
 * Replace this with a real speech-to-text function if you have one.
 */
async function transcribeBufferMock(wavBuffer: Buffer, index: number) {
  await new Promise(res => setTimeout(res, 400 + Math.min(2000, wavBuffer.length / 10000)))
  return `Transcribed chunk ${index} (simulated) — ${Math.round(wavBuffer.length / 1024)} KB`
}

/**
 * Try to transcribe with a configured provider:
 * Preference order:
 *  - GROQ (if GROQ_API_KEY and ./lib/groq.transcribeAudioBuffer)
 *  - Gemini (if GEMINI_API_KEY and ./lib/gemini.transcribeAudioBuffer)
 *  - fallback mock
 */
async function transcribeBufferWithProvider(wavBuffer: Buffer, index: number) {
  // Try GROQ
  if (process.env.GROQ_API_KEY) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const groq = require('./lib/groq')
      if (groq && typeof groq.transcribeAudioBuffer === 'function') {
        const text = await groq.transcribeAudioBuffer(wavBuffer, { index })
        return String(text)
      }
    } catch (e) {
      console.warn('groq transcribe attempt failed:', (e as any).message || e)
    }
  }

  // Try gemini audio transcribe if available
  if (process.env.GEMINI_API_KEY) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const gemini = require('./lib/gemini')
      if (gemini && typeof gemini.transcribeAudioBuffer === 'function') {
        const text = await gemini.transcribeAudioBuffer(wavBuffer, { sessionIndex: index })
        return String(text)
      }
    } catch (e) {
      console.warn('gemini transcribe attempt failed:', (e as any).message || e)
    }
  }

  // fallback
  return transcribeBufferMock(wavBuffer, index)
}

/**
 * Try to find a summarizer function:
 * Preference:
 *  - GROQ (./lib/groq.summarize)
 *  - Gemini (./lib/gemini.summarizeText or summarizeText)
 *  - fallback simple summarizer
 */
async function summarizeTranscriptText(fullTranscript: string): Promise<string> {
  // Try GROQ first if configured
  if (process.env.GROQ_API_KEY) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const groq = require('./lib/groq')
      if (groq && typeof groq.summarize === 'function') {
        const out = await groq.summarize(fullTranscript)
        return String(out)
      }
      if (groq && typeof groq.summarizeText === 'function') {
        const out = await groq.summarizeText(fullTranscript)
        return String(out)
      }
    } catch (e) {
      console.warn('groq summarize failed:', (e as any).message || e)
    }
  }

  // Try Gemini text summary next
  if (process.env.GEMINI_API_KEY) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const gemini = require('./lib/gemini')
      if (gemini && typeof gemini.summarizeText === 'function') {
        return String(await gemini.summarizeText(fullTranscript))
      }
      if (gemini && typeof gemini.summarize === 'function') {
        return String(await gemini.summarize(fullTranscript))
      }
    } catch (e) {
      console.warn('gemini summarize failed:', (e as any).message || e)
    }
  }

  // Fallback simple summarizer: return short excerpt + metadata
  const lines = fullTranscript.split('\n').map(l => l.trim()).filter(Boolean)
  const first = lines.slice(0, 6).join('\n')
  const summary = [
    '[SUMMARY]',
    'This is a fallback summary generated locally.',
    `Total lines in transcript: ${lines.length}`,
    '',
    'Preview:',
    first || '(no transcript content)'
  ].join('\n')

  return summary
}

/**
 * Core handler wiring for socket.io
 */
export default function recordingSocket(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log('socket connected', socket.id)

    // store current session id for this socket (not required but convenient)
    let activeSessionId: string | null = null

    socket.on('audio-chunk', async (payload: any) => {
      try {
        // payload: { sessionId, index, chunk: ArrayBuffer or Uint8Array or Buffer }
        const { sessionId, index, chunk } = payload ?? {}
        if (!sessionId || chunk == null) return

        const safe = safeName(sessionId)
        const sessionDir = path.join(BASE_CHUNKS_DIR, safe)
        if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true })

        // chunk might be ArrayBuffer; convert to Buffer
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(new Uint8Array(chunk))

        // write chunk file with index for ordering
        const filename = path.join(sessionDir, `chunk-${String(index).padStart(6, '0')}.webm`)
        await writeFile(filename, buf)
        console.log(`saved chunk ${index} for session ${sessionId} -> ${filename} (${buf.length} bytes)`)
        activeSessionId = sessionId

        // optional ack
        socket.emit('chunk-received', { sessionId, index })
      } catch (err) {
        console.error('audio-chunk handler error', err)
      }
    })

    socket.on('pause-session', (payload: any) => {
      console.log('pause-session', payload)
      socket.emit('paused', payload)
    })

    socket.on('resume-session', (payload: any) => {
      console.log('resume-session', payload)
      socket.emit('resumed', payload)
    })

    socket.on('stop-session', async (payload: any) => {
      try {
        const { sessionId } = payload ?? {}
        if (!sessionId) {
          console.warn('stop-session without sessionId')
          return
        }
        console.log('stop-session received for', sessionId)

        // inform clients that processing will start
        socket.emit('processing', { sessionId })
        // Process the session in this handler
        await processSessionAndTranscribe(sessionId, socket)

        // After processing, read the saved transcript and produce/append summary
        const safe = safeName(sessionId)
        const outDir = path.join(os.tmpdir(), 'scribeai_sessions')
        const textPath = path.join(outDir, `${safe}.txt`)
        let summaryText = `Transcript saved for ${sessionId}`

        try {
          const fullTranscript = fs.existsSync(textPath) ? await readFile(textPath, 'utf8') : ''
          summaryText = await summarizeTranscriptText(fullTranscript)
          // append summary
          await appendFile(textPath, `\n\n${summaryText}\n`, { encoding: 'utf8' })
        } catch (err) {
          console.error('error generating/appending summary', err)
        }

        // final completed event includes summary
        socket.emit('completed', { sessionId, summary: summaryText })
      } catch (err) {
        console.error('stop-session processing error', err)
        socket.emit('processing-error', { error: String((err as any)?.message || err) })
      }
    })

    socket.on('disconnect', (reason) => {
      console.log('socket disconnected', socket.id, reason)
    })
  })
}

/**
 * Process session chunks:
 * - find chunk files
 * - for each chunk convert to WAV using webmToLinear16
 * - transcribe (provider if available else mock)
 * - append transcript to text file in server temp session folder
 */
async function processSessionAndTranscribe(sessionId: string, socket: Socket) {
  const safe = safeName(sessionId)
  const sessionDir = path.join(BASE_CHUNKS_DIR, safe)
  const outDir = path.join(os.tmpdir(), 'scribeai_sessions')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const textPath = path.join(outDir, `${safe}.txt`)

  if (!fs.existsSync(sessionDir)) {
    console.warn('No chunks found for', sessionId, sessionDir)
    await appendFile(textPath, `Session: ${sessionId}\nSaved: ${new Date().toISOString()}\n\n(No audio chunks found)\n`)
    return
  }

  // read chunk files sorted by filename
  const files = (await readdir(sessionDir)).filter(f => f.endsWith('.webm')).sort()
  if (files.length === 0) {
    await appendFile(textPath, `Session: ${sessionId}\nSaved: ${new Date().toISOString()}\n\n(No audio chunks found)\n`)
    return
  }

  // append header if not exists
  if (!fs.existsSync(textPath)) {
    await writeFile(textPath, `Session: ${sessionId}\nSaved: ${new Date().toISOString()}\n\n`)
  } else {
    await appendFile(textPath, `\n\n--- new processing pass: ${new Date().toISOString()} ---\n`)
  }

  // process each chunk
  for (let i = 0; i < files.length; i++) {
    const fname = files[i]
    const fpath = path.join(sessionDir, fname)
    try {
      const webmBuf = await readFile(fpath)
      // convert webm -> linear16 wav buffer (16000Hz mono)
      const wavBuf = await webmToLinear16(webmBuf)
      // transcribe (provider if available else mock)
      const txt = await transcribeBufferWithProvider(wavBuf, i)
      // append to transcript file
      const cue = `\n[chunk ${i} - ${fname}]\n${txt}\n`
      await appendFile(textPath, cue, { encoding: 'utf8' })
      // emit partial transcript to clients
      socket.emit('partial-transcript', { sessionId, index: i, text: txt })
      console.log(`processed chunk ${i} for ${sessionId}`)
    } catch (err) {
      console.error('failed processing chunk', fpath, err)
      await appendFile(textPath, `\n[chunk ${i} processing error] ${(err as any).message || err}\n`)
    }
  }

  console.log('session processing complete for', sessionId, 'transcript saved at', textPath)
}
