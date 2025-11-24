// server/test-summarize.ts
(async () => {
  try {
    const { summarizeText } = await import('./src/lib/groq')
    const txt = `Alice: We need to ship v1 on Friday.
Bob: I'll finish the API by Wednesday.
Carol: I'll write tests and run QA by Thursday.
Meeting ended.`
    const summary = await summarizeText(txt)
    console.log('=== SUMMARY RESULT ===')
    console.log(summary)
  } catch (e) {
    console.error('ERROR running summarize test:', e)
  }
})()
