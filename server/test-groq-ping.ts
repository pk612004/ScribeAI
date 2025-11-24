// test-groq-ping.ts
(async () => {
  try {
    const groq = await import('./src/lib/groq')
    if (typeof groq.ping !== 'function') {
      console.log('groq.ping not found. exports:', Object.keys(groq))
      return
    }
    const r = await groq.ping()
    console.log('PING OK:', r)
  } catch (e) {
    console.error('Error running ping():', e)
  }
})()
