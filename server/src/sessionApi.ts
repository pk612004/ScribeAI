// server/src/sessionApi.ts
import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const router = Router()

// Directory where session files are stored
const SESSIONS_DIR = path.join(process.env.TEMP || '/tmp', 'scribeai_sessions')

// Ensure directory exists
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true })
}

// Convert a sessionId (arbitrary user string) to a safe filename.
// We use base64url of the UTF-8 string so it's deterministic, URL/file safe, and reversible if needed.
function safeFilenameFromSessionId(sessionId: string) {
  // fallback if no sessionId
  const id = String(sessionId ?? 'unnamed')
  // Node supports base64url in Buffer.toString('base64url')
  // Add short hash suffix to avoid collisions for long names that canonicalize the same
  const base = Buffer.from(id, 'utf8').toString('base64url')
  const short = crypto.createHash('sha1').update(id).digest('hex').slice(0, 8)
  return `${base}_${short}.txt`
}

// Helper to get file path
function filepathFor(sessionId: string) {
  const name = safeFilenameFromSessionId(sessionId)
  return path.join(SESSIONS_DIR, name)
}

/**
 * POST /session/save
 * Body: { sessionId, title }
 *
 * Creates a session .txt file (placeholder) so download works.
 * In your full app you may want to append real transcript text here.
 */
router.post('/session/save', (req, res) => {
  try {
    const { sessionId, title } = req.body
    if (!sessionId) return res.status(400).json({ error: 'sessionId missing' })

    const filePath = filepathFor(sessionId)
    const now = new Date().toISOString()
    const header = `Session: ${String(title || sessionId)}\nSaved: ${now}\n\n`

    // write initial file (overwrite if exists)
    fs.writeFileSync(filePath, header, { encoding: 'utf8' })

    return res.json({ ok: true, file: path.basename(filePath) })
  } catch (err) {
    console.error('session save error', err)
    return res.status(500).json({ error: 'save failed', details: (err as any).message })
  }
})

/**
 * GET /session/download?sessionId=xxx&format=txt
 */
router.get('/session/download', (req, res) => {
  try {
    const sessionId = String(req.query.sessionId || '')
    const format = String(req.query.format || 'txt')

    if (!sessionId) return res.status(400).send('sessionId missing')

    const filePath = filepathFor(sessionId)

    if (!fs.existsSync(filePath)) {
      // helpful debug: list contents (not for prod)
      const files = fs.readdirSync(SESSIONS_DIR)
      console.warn('download requested but file missing', filePath, 'dir contains', files.slice(0, 20))
      return res.status(404).send('No transcript found')
    }

    // set content-disposition for download
    res.download(filePath, `${sessionId}.${format}`)
  } catch (err) {
    console.error('session download error', err)
    return res.status(500).send('download failed')
  }
})

export default router
