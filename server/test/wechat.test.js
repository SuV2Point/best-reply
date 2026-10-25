import assert from 'node:assert/strict'
import test from 'node:test'
import { createWechatClient } from '../src/wechat.js'

function jsonResponse(body, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    async json() {
      return body
    },
  }
}

test('wechat client exchanges a login code and caches the access token', async () => {
  const calls = []
  const client = createWechatClient({
    appId: 'app',
    secret: 'sec',
    fetchImpl: async (url) => {
      calls.push(String(url))
      if (String(url).includes('jscode2session')) {
        return jsonResponse({ openid: 'o-1' })
      }
      return jsonResponse({ access_token: 'token-1', expires_in: 7200 })
    },
  })

  assert.equal(await client.codeToOpenId('js-code'), 'o-1')
  assert.equal(await client.accessToken(), 'token-1')
  assert.equal(await client.accessToken(), 'token-1')
  assert.equal(calls.filter((url) => url.includes('cgi-bin/token')).length, 1)
})

test('wechat client reports risky text and sends a subscribe message', async () => {
  const calls = []
  const client = createWechatClient({
    appId: 'app',
    secret: 'sec',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), body: options.body })
      if (String(url).includes('cgi-bin/token')) {
        return jsonResponse({ access_token: 'token-1', expires_in: 7200 })
      }
      if (String(url).includes('msg_sec_check')) {
        return jsonResponse({ errcode: 0, result: { suggest: 'risky' } })
      }
      return jsonResponse({ errcode: 0 })
    },
  })

  const checked = await client.checkText({ openid: 'o-1', content: '你好' })
  assert.equal(checked.ok, false)
  const sent = await client.sendSubscribe({
    openid: 'o-1',
    templateId: 'tmpl',
    page: 'pages/post/post?id=1',
    data: { thing1: { value: '求助' } },
  })
  assert.equal(sent.errcode, 0)
  const subscribe = calls.find((call) => call.url.includes('subscribe/send'))
  assert.equal(JSON.parse(subscribe.body).template_id, 'tmpl')
  assert.equal(JSON.parse(subscribe.body).touser, 'o-1')
})
