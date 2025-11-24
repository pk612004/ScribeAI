# ScribeAI Frontend (app)

Quick steps:
1. `cd app`
2. `npm install`
3. `npm run dev`

The frontend includes:
- `/app/page.tsx` — simple landing page
- `/app/sessions/page.tsx` — recorder UI that implements MediaRecorder chunking and streams to the Socket.io server
- `/app/components/Recorder.tsx` — React hook & component for recording and sending audio chunks

Make sure the Socket.io server (in ../server) is running at the URL specified in `app/.env.local`.


## New features added
- Gemini Live WS client stub implemented in server/src/lib/gemini.ts (configure GEMINI_WS_URL & GEMINI_API_KEY)
- FFmpeg pipeline for webm->linear16 in server/src/ffmpeg.ts
- Redis adapter wiring in server/src/index.ts (set REDIS_URL)
- Session history, download .txt, dark mode toggle in frontend
