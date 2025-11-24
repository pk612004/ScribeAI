'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'

// Recorder loaded client-side (good)
const Recorder = dynamic(() => import('../components/Recorder'), { ssr: false })

export default function SessionsPage() {
  return (
    <main className="min-h-screen p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold">Start a Recording Session</h2>

        {/* ✅ FIXED: No <a> tag inside Link */}
        <Link 
          href="/sessions/history"
          className="text-blue-600 underline"
        >
          History
        </Link>
      </div>

      <Recorder />
    </main>
  )
}
