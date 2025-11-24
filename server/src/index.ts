// server/src/index.ts
// (Updated to enable CORS for the API and Socket.IO)
// Screenshot reference (uploaded earlier): /mnt/data/d5ec71bc-adc1-4c13-b6a7-22fc1aac91f9.png

import express from 'express'
import http from 'http'
import cors from 'cors'
import { Server } from 'socket.io'
import recordingSocket from './recordingSocket'
import dotenv from 'dotenv'
dotenv.config()

const app = express()

// === CORS configuration ===
// Allow local dev frontends (adjust origins as needed)
const allowedOrigins = [
  'http://localhost:3001', // your Next.js (current) host
  'http://localhost:3000'  // fallback if Next picks 3000
]

app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (like curl, mobile apps, or server-to-server)
    if (!origin) return callback(null, true)
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true)
    } else {
      return callback(new Error('Not allowed by CORS'), false)
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

// Allow preflight across the board
app.options('*', cors())

// JSON parser
app.use(express.json())

// create http server and socket.io server with CORS config
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
})

// Optional Redis adapter for horizontal scaling
const redisUrl = process.env.REDIS_URL
if (redisUrl) {
  try {
    import('@socket.io/redis-adapter').then(({ createAdapter }) => {
      import('ioredis').then(({ default: IORedis }) => {
        const pubClient = new IORedis(redisUrl)
        const subClient = pubClient.duplicate()
        io.adapter(createAdapter(pubClient, subClient))
        console.log('Socket.io Redis adapter configured')
      }).catch(err => console.warn('ioredis load failed', err))
    }).catch(err => console.warn('redis-adapter load failed', err))
  } catch (err) {
    console.warn('Redis adapter init failed', err)
  }
}

// Simple health route
app.get('/', (req, res) => res.send('ScribeAI Server running'))

// Mount API routers (these should respond with normal CORS headers because of app.use(cors()))
import sessionApi from './sessionApi'
import sessionListApi from './sessionListApi'
app.use('/', sessionApi)
app.use('/', sessionListApi)

// Attach socket handlers
recordingSocket(io)

// If you have any routes that stream files (download), ensure proper headers are set inside those handlers.
// Example (optional) per-route fallback — uncomment if you need per-route header enforcement:
// app.get('/session/download', (req,res,next) => {
//   res.header('Access-Control-Allow-Origin', allowedOrigins.join(',')); // or '*' if you prefer
//   next()
// })

const port = process.env.PORT || 4000
server.listen(port, () => console.log(`Server listening on ${port}`))
