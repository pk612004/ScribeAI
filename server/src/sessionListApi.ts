import express from 'express'
import path from 'path'
import fs from 'fs/promises'
import { tmpdir } from 'os'
const router = express.Router()
const base = path.join(tmpdir(), 'scribeai_chunks')

router.get('/session/list', async (req, res) => {
  const items = await fs.readdir(base).catch(()=>[])
  return res.json({ items })
})

export default router
