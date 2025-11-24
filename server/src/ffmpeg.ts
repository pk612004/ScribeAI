// server/src/ffmpeg.ts
/**
 * FFmpeg helper — prefer explicit FFMPEG_PATH, then @ffmpeg-installer, else rely on system PATH.
 * This file makes sure fluent-ffmpeg is pointed at the right binary.
 */

import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import os from 'os'
import path from 'path'

let ffmpegPath: string | undefined

// 1) If user set an explicit env var, use it
if (process.env.FFMPEG_PATH && process.env.FFMPEG_PATH.trim() !== '') {
  ffmpegPath = process.env.FFMPEG_PATH
}

// 2) try @ffmpeg-installer if no env var
if (!ffmpegPath) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const installer = require('@ffmpeg-installer/ffmpeg')
    if (installer && installer.path) ffmpegPath = installer.path
  } catch (e) {
    // installer not present — ignore
  }
}

// 3) if we found a path, set it for fluent-ffmpeg
if (ffmpegPath) {
  try {
    ffmpeg.setFfmpegPath(ffmpegPath)
    console.log('fluent-ffmpeg: using ffmpeg at', ffmpegPath)
  } catch (e) {
    console.warn('fluent-ffmpeg: failed to set ffmpeg path:', ffmpegPath, e)
  }
} else {
  console.log('fluent-ffmpeg: no explicit FFMPEG_PATH or installer binary found — relying on system PATH ffmpeg')
}

export async function webmToLinear16(inputBuffer: Buffer): Promise<Buffer> {
  const inPath = path.join(os.tmpdir(), `in_${Date.now()}.webm`)
  const outPath = path.join(os.tmpdir(), `out_${Date.now()}.wav`)
  await fs.promises.writeFile(inPath, inputBuffer)
  return new Promise<Buffer>((resolve, reject) => {
    ffmpeg(inPath)
      .audioCodec('pcm_s16le')
      .format('wav')
      .audioFrequency(16000)
      .audioChannels(1)
      .on('end', async () => {
        try {
          const out = await fs.promises.readFile(outPath)
          fs.promises.unlink(inPath).catch(()=>{})
          fs.promises.unlink(outPath).catch(()=>{})
          resolve(out)
        } catch (e) { reject(e) }
      })
      .on('error', (err) => {
        fs.promises.unlink(inPath).catch(()=>{})
        reject(err)
      })
      .save(outPath)
  })
}
