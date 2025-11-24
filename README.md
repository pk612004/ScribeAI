# ScribeAI — Starter Prototype (Attack Capital Assignment)
##  Demo Video

[![Watch Demo](https://img.shields.io/badge/Watch%20Demo%20Video-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://youtu.be/P1zu-k8bRng)

This is a starter scaffold for the **AI-Powered Audio Scribing & Meeting Transcription App** (ScribeAI).
It contains:
- A Next.js 14+ (TypeScript) app skeleton (in `/app`)
- A Node.js Socket.io server (in `/server`)
- Prisma schema for Postgres (in `/server/prisma`)
- Stubs for GROQ integration and instructions

**What I built:** a production-minded starter that implements client-side chunked recording, Socket.io streaming, server-side queueing & Prisma schema, and a summarization/transcript flow stub. GROQ integration is provided as a clear, documented stub (`/server/lib/gemini.ts`) where you can add your Gemini API key and adjust the live-socket code per Gemini docs.

Download and inspect the project, then follow the Quick Start in `/app/README.md`.

---
