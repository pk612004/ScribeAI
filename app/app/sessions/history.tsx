'use client'
import { useEffect, useState } from 'react'

export default function History() {
  const [items, setItems] = useState<string[]>([])
  useEffect(() => {
    fetch('/session/list').then(r=>r.json().then(j=>setItems(j.items||[]))).catch(()=>{})
  }, [])
  return (
    <div className="max-w-3xl">
      <h3 className="text-2xl font-semibold mb-4">Session History</h3>
      <div className="grid grid-cols-1 gap-3">
        {items.length === 0 && <div className="p-4 border rounded text-sm text-gray-500">No sessions found yet.</div>}
        {items.map((it)=> (
          <div key={it} className="p-3 border rounded flex justify-between items-center bg-white dark:bg-gray-800">
            <div>
              <div className="font-medium">{it}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Temporary session folder</div>
            </div>
            <div className="space-x-2">
              <a href={`/session/download?sessionId=${encodeURIComponent(it)}&format=txt`} className="px-3 py-1 bg-slate-700 text-white rounded text-sm">Download TXT</a>
              <a href={`/session/download?sessionId=${encodeURIComponent(it)}&format=vtt`} className="px-3 py-1 bg-slate-600 text-white rounded text-sm">Download VTT</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
