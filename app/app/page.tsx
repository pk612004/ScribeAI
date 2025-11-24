import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <h1 className="text-3xl font-bold mb-4">ScribeAI — Starter</h1>

        <p className="mb-4">
          Prototype starter for Attack Capital assignment: audio chunking,
          Socket.io streaming, Prisma Postgres schema, and Gemini integration stubs.
        </p>

        <div className="space-x-2">
          {/* ✅ FIXED: No <a> tag inside Link */}
          <Link 
            href="/sessions"
            className="px-4 py-2 bg-blue-600 text-white rounded"
          >
            Open Recorder
          </Link>
        </div>
      </div>
    </main>
  )
}
