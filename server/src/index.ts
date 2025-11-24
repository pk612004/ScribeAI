

import express from 'express'
import http from 'http'
import cors from 'cors'
import { Server } from 'socket.io'
import recordingSocket from './recordingSocket'
import dotenv from 'dotenv'
dotenv.config()

const app = express()

const allowedOrigins = [
  'http://localhost:3001',
  'http://localhost:3000'  
]

app.use(cors({
  origin: (origin, callback) => {

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

app.options('*', cors())

app.use(express.json())

const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
})

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


app.get('/', (req, res) => res.send('ScribeAI Server running'))


import sessionApi from './sessionApi'
import sessionListApi from './sessionListApi'
app.use('/', sessionApi)
app.use('/', sessionListApi)

recordingSocket(io)


const port = process.env.PORT || 4000
server.listen(port, () => console.log(`Server listening on ${port}`))
