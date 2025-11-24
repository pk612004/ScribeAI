import request from 'supertest'
import express from 'express'
import sessionApi from '../sessionApi'
import sessionListApi from '../sessionListApi'
const app = express()
app.use(express.json())
app.use('/', sessionApi)
app.use('/', sessionListApi)

describe('session endpoints', () => {
  test('save and list session', async () => {
    const res = await request(app).post('/save').send({ sessionId: 'test-session', title: 'test' })
    expect(res.status).toBe(200)
    const list = await request(app).get('/session/list')
    expect(list.status).toBe(200)
    expect(Array.isArray(list.body.items)).toBe(true)
  })

  test('download vtt returns vtt content', async () => {
    const res = await request(app).get('/download').query({ sessionId: 'test-session', format: 'vtt' })
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/vtt/)
  })
})
