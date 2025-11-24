'use client'
import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { z } from 'zod'

declare global {
  interface Window { MediaRecorder?: any }
}

const StartRequestSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  mode: z.enum(['mic','tab']).default('mic')
})

type SocketStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export default function Recorder() {
  const [status, setStatus] = useState<'idle'|'recording'|'paused'|'processing'|'completed'>('idle')
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('disconnected')
  const socketRef = useRef<Socket | null>(null)
  const recorderRef = useRef<any>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [transcript, setTranscript] = useState('')
  const [title, setTitle] = useState('Meeting ' + new Date().toLocaleString())
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SOCKET_IO_URL || 'http://localhost:4000'
    setSocketStatus('connecting')
    // allow polling fallback so Brave/Proxies can connect
    const socket = io(url, {
      transports: ['polling','websocket'],
      autoConnect: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      console.log('SOCKET CONNECTED', socket.id)
      setSocketStatus('connected')
    })
    socket.on('disconnect', (reason:any) => {
      console.log('SOCKET DISCONNECT', reason)
      setSocketStatus('disconnected')
    })
    socket.on('connect_error', (err:any) => {
      console.error('SOCKET CONNECT_ERROR', err)
      setSocketStatus('error')
    })
    socket.on('reconnect_attempt', (n:number) => {
      console.log('SOCKET reconnect attempt', n)
      setSocketStatus('connecting')
    })

    socket.on('partial-transcript', (data:any) => {
      console.log('partial-transcript', data)
      setTranscript(prev => prev + '\n' + (data.text || ''))
    })
    socket.on('completed', (data:any) => {
      console.log('completed', data)
      setTranscript(prev => prev + '\n[SUMMARY]\n' + (data.summary || ''))
      setStatus('completed')
    })

    return () => {
      try { socket.disconnect() } catch (e) {}
      socketRef.current = null
    }
  }, [])

  const start = async (mode:'mic'|'tab' = 'mic') => {
    const parsed = StartRequestSchema.parse({ title, mode })
    console.log('start parsed', parsed)
    setTranscript('')
    setStatus('recording')
    const constraints = mode === 'tab'
      ? { audio: true, video: false }
      : { audio: true }
    try {
      const stream = mode === 'tab'
        ? await (navigator.mediaDevices as any).getDisplayMedia({ audio: true, video: false })
        : await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mime = 'audio/webm;codecs=opus'
      const MediaRec = window.MediaRecorder || (window as any).MediaRecorder
      if (!MediaRec) {
        alert('MediaRecorder is not supported in this browser')
        setStatus('idle')
        return
      }
      const recorder = new MediaRec(stream, { mimeType: mime })
      recorderRef.current = recorder
      let index = 0
      const CHUNK_MS = 10_000 // 10s

      recorder.onstart = () => {
        console.log('recorder started')
      }
      recorder.ondataavailable = async (e:any) => {
        try {
          console.log('ondataavailable size=', e.data?.size)
          if (e.data && e.data.size > 0) {
            // convert to ArrayBuffer (socket.io can send binary)
            const arr = await e.data.arrayBuffer()
            // optional: convert to Uint8Array if you need
            // const u8 = new Uint8Array(arr)
            socketRef.current?.emit('audio-chunk', { sessionId: title, index, chunk: arr })
            console.log('sent chunk', index, 'bytes=', e.data.size)
            index++
          }
        } catch (err) {
          console.error('ondataavailable error', err)
        }
      }
      recorder.onpause = () => {
        console.log('recorder paused')
      }
      recorder.onresume = () => {
        console.log('recorder resumed')
      }
      recorder.onstop = () => {
        console.log('recorder stopped, emitting stop-session')
        socketRef.current?.emit('stop-session', { sessionId: title })
        // Save session metadata to server
        fetch(`${process.env.NEXT_PUBLIC_SOCKET_IO_URL || 'http://localhost:4000'}/session/save`, {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify({ sessionId: title, title })
        }).catch((e)=>{ console.warn('session save failed', e) })
      }
      recorder.onerror = (err:any) => {
        console.error('recorder error', err)
      }

      recorder.start(CHUNK_MS)
      setStatus('recording')
    } catch (err) {
      console.error('start error', err)
      setStatus('idle')
      alert('Could not start recording: ' + (err as any).message)
    }
  }

  const pause = () => {
    try {
      recorderRef.current?.pause()
      setStatus('paused')
      socketRef.current?.emit('pause-session', { sessionId: title })
    } catch (e) { console.warn(e) }
  }
  const resume = () => {
    try {
      recorderRef.current?.resume()
      setStatus('recording')
      socketRef.current?.emit('resume-session', { sessionId: title })
    } catch (e) { console.warn(e) }
  }
  const stop = () => {
    try {
      recorderRef.current?.stop()
      streamRef.current?.getTracks().forEach(t => t.stop())
      setStatus('processing')
    } catch (e) { console.warn(e) }
  }

  const downloadTxt = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SOCKET_IO_URL || 'http://localhost:4000'}/session/download?sessionId=${encodeURIComponent(title)}&format=txt`)
      if (!res.ok) return alert('download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${title}.txt`
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (e) {
      console.error('download error', e)
      alert('Download failed')
    }
  }

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="max-w-2xl">
        <div className="flex items-center gap-4 mb-4">
          <input value={title} onChange={(e)=>setTitle(e.target.value)} className="border p-2 rounded flex-1" />
          <button onClick={()=>setDark(d=>!d)} className="px-3 py-1 border rounded">{dark ? 'Light' : 'Dark'}</button>
        </div>

        <div className="flex items-center gap-4 mb-2">
          <div>Socket:&nbsp;
            <span style={{
              display: 'inline-block',
              minWidth: 70,
              padding: '3px 6px',
              borderRadius: 6,
              background: socketStatus === 'connected' ? '#16a34a' : socketStatus === 'connecting' ? '#f59e0b' : socketStatus === 'error' ? '#ef4444' : '#6b7280',
              color: 'white',
              fontWeight: 600,
              fontSize: 12
            }}>{socketStatus}</span>
          </div>
          <div className="text-sm text-gray-500">Status: <strong>{status}</strong></div>
        </div>

        <div className="space-x-2 mb-4">
          <button onClick={()=>start('mic')} className="px-4 py-2 bg-green-600 text-white rounded">Start Mic</button>
          <button onClick={()=>start('tab')} className="px-4 py-2 bg-indigo-600 text-white rounded">Start Tab</button>
          <button onClick={pause} className="px-4 py-2 bg-yellow-500 text-white rounded">Pause</button>
          <button onClick={resume} className="px-4 py-2 bg-blue-500 text-white rounded">Resume</button>
          <button onClick={stop} className="px-4 py-2 bg-red-600 text-white rounded">Stop</button>
          <button onClick={downloadTxt} className="px-4 py-2 bg-slate-700 text-white rounded">Download .txt</button>
        </div>

        <div className="border p-4 rounded bg-white dark:bg-gray-800">
          <textarea className="w-full h-64 p-2 bg-white dark:bg-gray-900 dark:text-white" value={transcript} readOnly />
        </div>
      </div>
    </div>
  )
}
