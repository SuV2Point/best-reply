import express from 'express'
import { openDatabase } from './db.js'
import { HttpError } from './errors.js'
import { createService } from './service.js'

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}

export function createApp({
  dbPath = ':memory:',
  db,
  random,
  wechat = null,
  templates = {},
  now,
} = {}) {
  const database = db ?? openDatabase(dbPath)
  const service = createService(database, { random, wechat, templates, now })
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '32kb' }))

  function requireUser(req, res, next) {
    const header = req.get('authorization') || ''
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
    const user = token ? service.findByToken(token) : null
    if (!user) {
      res.status(401).json({ error: { code: 'unauthorized', message: '请先登录' } })
      return
    }
    req.user = user
    next()
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.post('/api/auth/dev', asyncHandler(async (req, res) => {
    res.json(service.loginDev(req.body))
  }))

  app.post('/api/auth/wechat', asyncHandler(async (req, res) => {
    res.json(await service.loginWechat(req.body))
  }))

  app.get('/api/me', requireUser, asyncHandler(async (req, res) => {
    res.json(service.profile(req.user))
  }))

  app.post('/api/me/subscribe', requireUser, asyncHandler(async (req, res) => {
    res.json(service.subscribe(req.user, req.body))
  }))

  app.get('/api/me/replies', requireUser, asyncHandler(async (req, res) => {
    res.json(service.listMyReplies(req.user, req.query))
  }))

  app.post('/api/posts', requireUser, asyncHandler(async (req, res) => {
    const post = await service.createPost(req.user, req.body)
    res.status(201).json({ post })
  }))

  app.get('/api/posts/mine', requireUser, asyncHandler(async (req, res) => {
    res.json(service.listMine(req.user, req.query))
  }))

  app.get('/api/posts/:id', requireUser, asyncHandler(async (req, res) => {
    res.json({ post: service.getPost(req.user, req.params.id) })
  }))

  app.post('/api/posts/:id/close', requireUser, asyncHandler(async (req, res) => {
    res.json({ post: service.closePost(req.user, req.params.id) })
  }))

  app.post('/api/posts/:id/skip', requireUser, asyncHandler(async (req, res) => {
    res.json(service.skipPost(req.user, req.params.id))
  }))

  app.post('/api/posts/:id/read', requireUser, asyncHandler(async (req, res) => {
    res.json(service.markPostRead(req.user, req.params.id))
  }))

  app.post('/api/posts/:id/replies', requireUser, asyncHandler(async (req, res) => {
    const reply = await service.reply(req.user, req.params.id, req.body)
    res.status(201).json({ reply })
  }))

  app.get('/api/match/next', requireUser, asyncHandler(async (req, res) => {
    res.json({ post: service.nextMatch(req.user) })
  }))

  app.get('/api/match/waiting-count', requireUser, asyncHandler(async (req, res) => {
    res.json({ count: service.waitingCount(req.user) })
  }))

  app.post('/api/replies/:id/god-assist', requireUser, asyncHandler(async (req, res) => {
    const reply = await service.setGodAssist(req.user, req.params.id, req.body)
    res.json({ reply })
  }))

  app.get('/api/notifications/unread-count', requireUser, asyncHandler(async (req, res) => {
    res.json({ count: service.unreadCount(req.user) })
  }))

  app.get('/api/notifications', requireUser, asyncHandler(async (req, res) => {
    res.json(service.listNotifications(req.user, req.query))
  }))

  app.post('/api/notifications/:id/read', requireUser, asyncHandler(async (req, res) => {
    res.json(service.markNotificationRead(req.user, req.params.id))
  }))

  app.use((error, _req, res, _next) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message } })
      return
    }
    if (error?.type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'invalid', message: '请求格式不正确' } })
      return
    }
    console.error(error)
    res.status(500).json({ error: { code: 'internal', message: '服务出了点问题' } })
  })

  app.closeDb = () => database.close()
  return app
}
