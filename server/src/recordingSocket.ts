
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


function safeName(sessionId: string) {
  const id = String(sessionId ?? 'unnamed')
  const base = Buffer.from(id, 'utf8').toString('base64url')
  const short = crypto.createHash('sha1').update(id).digest('hex').slice(0, 8)
  return `${base}_${short}`
}

const BASE_CHUNKS_DIR = path.join(os.tmpdir(), 'scribeai_chunks')
if (!fs.existsSync(BASE_CHUNKS_DIR)) fs.mkdirSync(BASE_CHUNKS_DIR, { recursive: true })


async function transcribeBufferMock(wavBuffer: Buffer, index: number) {
  await new Promise(res => setTimeout(res, 400 + Math.min(2000, wavBuffer.length / 10000)))
  return `Transcribed chunk ${index} (simulated) — ${Math.round(wavBuffer.length / 1024)} KB`
}


async function transcribeBufferWithProvider(wavBuffer: Buffer, index: number) {
 
  if (process.env.GROQ_API_KEY) {
    try {
    
      const groq = require('./lib/groq')
      if (groq && typeof groq.transcribeAudioBuffer === 'function') {
        const text = await groq.transcribeAudioBuffer(wavBuffer, { index })
        return String(text)
      }
    } catch (e) {
      console.warn('groq transcribe attempt failed:', (e as any).message || e)
    }
  }


  if (process.env.GEMINI_API_KEY) {
    try {
  
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


async function summarizeTranscriptText(fullTranscript: string): Promise<string> {

  if (process.env.GROQ_API_KEY) {
    try {

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


  if (process.env.GEMINI_API_KEY) {
    try {

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


export default function recordingSocket(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log('socket connected', socket.id)

    let activeSessionId: string | null = null

    socket.on('audio-chunk', async (payload: any) => {
      try {
     
        const { sessionId, index, chunk } = payload ?? {}
        if (!sessionId || chunk == null) return

        const safe = safeName(sessionId)
        const sessionDir = path.join(BASE_CHUNKS_DIR, safe)
        if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true })

    
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(new Uint8Array(chunk))

        const filename = path.join(sessionDir, `chunk-${String(index).padStart(6, '0')}.webm`)
        await writeFile(filename, buf)
        console.log(`saved chunk ${index} for session ${sessionId} -> ${filename} (${buf.length} bytes)`)
        activeSessionId = sessionId

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

        socket.emit('processing', { sessionId })
 
        await processSessionAndTranscribe(sessionId, socket)

        const safe = safeName(sessionId)
        const outDir = path.join(os.tmpdir(), 'scribeai_sessions')
        const textPath = path.join(outDir, `${safe}.txt`)
        let summaryText = `Transcript saved for ${sessionId}`

        try {
          const fullTranscript = fs.existsSync(textPath) ? await readFile(textPath, 'utf8') : ''
          summaryText = await summarizeTranscriptText(fullTranscript)
     
          await appendFile(textPath, `\n\n${summaryText}\n`, { encoding: 'utf8' })
        } catch (err) {
          console.error('error generating/appending summary', err)
        }

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

  const files = (await readdir(sessionDir)).filter(f => f.endsWith('.webm')).sort()
  if (files.length === 0) {
    await appendFile(textPath, `Session: ${sessionId}\nSaved: ${new Date().toISOString()}\n\n(No audio chunks found)\n`)
    return
  }

  if (!fs.existsSync(textPath)) {
    await writeFile(textPath, `Session: ${sessionId}\nSaved: ${new Date().toISOString()}\n\n`)
  } else {
    await appendFile(textPath, `\n\n--- new processing pass: ${new Date().toISOString()} ---\n`)
  }

  for (let i = 0; i < files.length; i++) {
    const fname = files[i]
    const fpath = path.join(sessionDir, fname)
    try {
      const webmBuf = await readFile(fpath)
    
      const wavBuf = await webmToLinear16(webmBuf)
  
      const txt = await transcribeBufferWithProvider(wavBuf, i)
  
      const cue = `\n[chunk ${i} - ${fname}]\n${txt}\n`
      await appendFile(textPath, cue, { encoding: 'utf8' })
   
      socket.emit('partial-transcript', { sessionId, index: i, text: txt })
      console.log(`processed chunk ${i} for ${sessionId}`)
    } catch (err) {
      console.error('failed processing chunk', fpath, err)
      await appendFile(textPath, `\n[chunk ${i} processing error] ${(err as any).message || err}\n`)
    }
  }

  console.log('session processing complete for', sessionId, 'transcript saved at', textPath)
}
