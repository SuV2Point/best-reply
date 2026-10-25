import assert from 'node:assert/strict'
import { createApp } from '../src/app.js'

export async function start(t, options = {}) {
  const app = createApp({ dbPath: ':memory:', ...options })
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  }))
  t.after(() => app.closeDb())
  const { port } = server.address()
  const base = `http://127.0.0.1:${port}`

  return async function api(method, path, { token, body } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    const data = text ? JSON.parse(text) : null
    return { status: response.status, data }
  }
}

export async function devLogin(api, nickname, clientId) {
  const result = await api('POST', '/api/auth/dev', {
    body: { nickname, clientId },
  })
  assert.equal(result.status, 200)
  return result.data
}

export const samplePost = {
  scene: '前任',
  ask: '凌晨这句我完全不知道怎么接',
  messages: [
    { role: 'other', text: '睡了吗' },
    { role: 'me', text: '刚躺下' },
    { role: 'other', text: '那我打给你？' },
  ],
}
