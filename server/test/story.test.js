import assert from 'node:assert/strict'
import test from 'node:test'
import { devLogin, samplePost, start } from './helpers.js'

test('dev login rejects a blank nickname and reuses the same device', async (t) => {
  const api = await start(t)
  const bad = await api('POST', '/api/auth/dev', {
    body: { nickname: '  ', clientId: 'device-aaaabbbb' },
  })
  assert.equal(bad.status, 400)

  const first = await devLogin(api, '阿梨', 'device-aaaabbbb')
  const second = await devLogin(api, '阿梨梨', 'device-aaaabbbb')
  assert.equal(second.token, first.token)
  assert.equal(second.user.nickname, '阿梨梨')

  const missing = await api('GET', '/api/me')
  assert.equal(missing.status, 401)
  const me = await api('GET', '/api/me', { token: first.token })
  assert.equal(me.status, 200)
  assert.equal(me.data.nickname, '阿梨梨')
  assert.equal(me.data.stats.posts, 0)
})

test('publishing stores the stuck conversation', async (t) => {
  const api = await start(t)
  const author = await devLogin(api, '阿梨', 'device-author0001')
  const created = await api('POST', '/api/posts', {
    token: author.token,
    body: samplePost,
  })
  assert.equal(created.status, 201)
  assert.equal(created.data.post.ask, samplePost.ask)
  assert.deepEqual(created.data.post.messages, samplePost.messages)
  assert.equal(created.data.post.status, 'open')
  assert.equal(created.data.post.author.nickname, '阿梨')

  const mine = await api('GET', '/api/posts/mine', { token: author.token })
  assert.equal(mine.data.posts.length, 1)
  assert.equal(mine.data.posts[0].replyCount, 0)
})

test('a post must contain a real stuck line and a question', async (t) => {
  const api = await start(t)
  const author = await devLogin(api, '阿梨', 'device-author0002')
  const cases = [
    { ...samplePost, ask: '   ' },
    { ...samplePost, messages: [] },
    { ...samplePost, messages: [{ role: 'bot', text: '你好' }] },
    { ...samplePost, messages: [{ role: 'other', text: '   ' }] },
    {
      ...samplePost,
      messages: Array.from({ length: 21 }, () => ({ role: 'other', text: '在吗' })),
    },
  ]
  for (const body of cases) {
    const result = await api('POST', '/api/posts', { token: author.token, body })
    assert.equal(result.status, 400, JSON.stringify(body))
  }
})

test('match hands out open posts the user has not handled', async (t) => {
  const api = await start(t, { random: () => 0 })
  const author = await devLogin(api, '阿梨', 'device-author0003')
  const helper = await devLogin(api, '小满', 'device-helper00001')
  const outsider = await devLogin(api, '老周', 'device-outsider001')

  const own = await api('POST', '/api/posts', { token: helper.token, body: samplePost })
  const older = await api('POST', '/api/posts', { token: author.token, body: samplePost })
  const newer = await api('POST', '/api/posts', {
    token: author.token,
    body: { ...samplePost, ask: '这句更晚发出' },
  })
  assert.equal(older.status, 201)

  const waiting = await api('GET', '/api/match/waiting-count', { token: helper.token })
  assert.equal(waiting.data.count, 2)

  const first = await api('GET', '/api/match/next', { token: helper.token })
  assert.equal(first.data.post.id, older.data.post.id)
  assert.equal(first.data.post.replies, undefined)
  assert.notEqual(first.data.post.id, own.data.post.id)
  const held = await api('GET', '/api/match/next', { token: helper.token })
  assert.equal(held.data.post.id, older.data.post.id)

  const skipped = await api('POST', `/api/posts/${older.data.post.id}/skip`, { token: helper.token })
  assert.equal(skipped.status, 200)
  const second = await api('GET', '/api/match/next', { token: helper.token })
  assert.equal(second.data.post.id, newer.data.post.id)

  await api('POST', `/api/posts/${newer.data.post.id}/replies`, {
    token: helper.token,
    body: { content: '你就说信号不好吧' },
  })
  const done = await api('GET', '/api/match/next', { token: helper.token })
  assert.equal(done.data.post, null)

  await api('POST', `/api/posts/${own.data.post.id}/close`, { token: helper.token })
  const stillThere = await api('GET', '/api/match/next', { token: outsider.token })
  assert.equal(stillThere.data.post.id, older.data.post.id)

  await api('POST', `/api/posts/${older.data.post.id}/close`, { token: author.token })
  const afterClose = await api('GET', '/api/match/next', { token: outsider.token })
  assert.equal(afterClose.data.post.id, newer.data.post.id)
})

test('a reply notifies the author, who can read it and stamp 神助攻', async (t) => {
  const sent = []
  const api = await start(t, {
    templates: { reply: 'tmpl-reply', godAssist: 'tmpl-god' },
    now: () => new Date('2026-10-25T02:30:00Z'),
    wechat: {
      async codeToOpenId(code) {
        return `openid-${code}`
      },
      async checkText() {
        return { ok: true }
      },
      async sendSubscribe(message) {
        sent.push(message)
        return { errcode: 0 }
      },
    },
  })

  const authorLogin = await api('POST', '/api/auth/wechat', {
    body: { code: 'author-code', nickname: '阿梨' },
  })
  const helperLogin = await api('POST', '/api/auth/wechat', {
    body: { code: 'helper-code', nickname: '小满' },
  })
  assert.equal(authorLogin.status, 200)
  const author = authorLogin.data
  const helper = helperLogin.data

  await api('POST', '/api/me/subscribe', { token: author.token, body: { purpose: 'reply' } })
  await api('POST', '/api/me/subscribe', { token: helper.token, body: { purpose: 'god_assist' } })

  const created = await api('POST', '/api/posts', { token: author.token, body: samplePost })
  const postId = created.data.post.id
  const matched = await api('GET', '/api/match/next', { token: helper.token })
  assert.equal(matched.data.post.id, postId)
  const reply = await api('POST', `/api/posts/${postId}/replies`, {
    token: helper.token,
    body: { content: '  那你就说刚洗完头，不方便  ' },
  })
  assert.equal(reply.status, 201)
  assert.equal(reply.data.reply.content, '那你就说刚洗完头，不方便')
  assert.equal(reply.data.reply.godAssist, false)

  assert.equal(sent.length, 1)
  assert.equal(sent[0].openid, 'openid-author-code')
  assert.equal(sent[0].templateId, 'tmpl-reply')
  assert.equal(sent[0].page, `pages/post/post?id=${postId}`)
  assert.equal(sent[0].data.thing2.value, '那你就说刚洗完头，不方便')
  assert.equal(sent[0].data.time3.value, '2026-10-25 10:30')

  const notes = await api('GET', '/api/notifications', { token: author.token })
  assert.equal(notes.data.unread, 1)
  assert.equal(notes.data.notifications[0].type, 'reply')
  assert.equal(notes.data.notifications[0].title, '小满 接了一句')
  assert.equal(notes.data.notifications[0].read, false)

  const detail = await api('GET', `/api/posts/${postId}`, { token: author.token })
  assert.equal(detail.data.post.replies.length, 1)
  const replyId = detail.data.post.replies[0].id

  const hidden = await api('GET', `/api/posts/${postId}`, { token: helper.token })
  assert.equal(hidden.data.post.replies.length, 1)
  assert.equal(hidden.data.post.replies[0].id, replyId)

  const stranger = await devLogin(api, '路人', 'device-stranger01')
  const strangerView = await api('GET', `/api/posts/${postId}`, { token: stranger.token })
  assert.equal(strangerView.status, 404)

  const stamped = await api('POST', `/api/replies/${replyId}/god-assist`, {
    token: author.token,
    body: { on: true },
  })
  assert.equal(stamped.status, 200)
  assert.equal(stamped.data.reply.godAssist, true)
  assert.equal(sent.length, 2)
  assert.equal(sent[1].openid, 'openid-helper-code')
  assert.equal(sent[1].templateId, 'tmpl-god')

  const again = await api('POST', `/api/replies/${replyId}/god-assist`, {
    token: author.token,
    body: { on: true },
  })
  assert.equal(again.status, 200)
  assert.equal(sent.length, 2)

  const helperNotes = await api('GET', '/api/notifications', { token: helper.token })
  assert.equal(helperNotes.data.notifications.length, 1)
  assert.equal(helperNotes.data.notifications[0].type, 'god_assist')
  assert.equal(helperNotes.data.notifications[0].title, '你的回复被标成了神助攻')

  const cleared = await api('POST', `/api/posts/${postId}/read`, { token: author.token })
  assert.equal(cleared.status, 200)
  const unread = await api('GET', '/api/notifications/unread-count', { token: author.token })
  assert.equal(unread.data.count, 0)

  const removed = await api('POST', `/api/replies/${replyId}/god-assist`, {
    token: author.token,
    body: { on: false },
  })
  assert.equal(removed.data.reply.godAssist, false)
  const helperAgain = await api('GET', '/api/notifications', { token: helper.token })
  assert.equal(helperAgain.data.notifications.length, 1)

  const me = await api('GET', '/api/me', { token: helper.token })
  assert.equal(me.data.stats.replies, 1)
  assert.equal(me.data.stats.godAssists, 0)
  const history = await api('GET', '/api/me/replies', { token: helper.token })
  assert.equal(history.data.replies[0].post.ask, samplePost.ask)
})

test('replies, stamps, and pushes stay inside their rules', async (t) => {
  const sent = []
  const api = await start(t, {
    templates: { reply: 'tmpl-reply', godAssist: 'tmpl-god' },
    wechat: {
      async checkText({ content }) {
        if (content.includes('违规')) return { ok: false }
        return { ok: true }
      },
      async sendSubscribe(message) {
        sent.push(message)
        if (message.openid === 'boom') throw new Error('wechat down')
        return { errcode: 0 }
      },
      async codeToOpenId(code) {
        return code
      },
    },
  })

  const author = await devLogin(api, '阿梨', 'device-author0004')
  const helper = await devLogin(api, '小满', 'device-helper00002')
  const created = await api('POST', '/api/posts', { token: author.token, body: samplePost })
  const postId = created.data.post.id

  const selfReply = await api('POST', `/api/posts/${postId}/replies`, {
    token: author.token,
    body: { content: '我自己来' },
  })
  assert.equal(selfReply.status, 403)

  const matched = await api('GET', '/api/match/next', { token: helper.token })
  assert.equal(matched.data.post.id, postId)

  const empty = await api('POST', `/api/posts/${postId}/replies`, {
    token: helper.token,
    body: { content: '   ' },
  })
  assert.equal(empty.status, 400)

  const riskyReply = await api('POST', `/api/posts/${postId}/replies`, {
    token: helper.token,
    body: { content: '这里有违规词' },
  })
  assert.equal(riskyReply.status, 400)
  assert.equal(riskyReply.data.error.code, 'rejected')

  const risky = await api('POST', '/api/posts', {
    token: author.token,
    body: { ...samplePost, ask: '这段有违规词' },
  })
  assert.equal(risky.status, 400)
  assert.equal(risky.data.error.code, 'rejected')

  const ok = await api('POST', `/api/posts/${postId}/replies`, {
    token: helper.token,
    body: { content: '先说你在外面' },
  })
  assert.equal(ok.status, 201)
  assert.equal(sent.length, 0)

  const twice = await api('POST', `/api/posts/${postId}/replies`, {
    token: helper.token,
    body: { content: '再说一次' },
  })
  assert.equal(twice.status, 409)

  const stamp = await api('POST', `/api/replies/${ok.data.reply.id}/god-assist`, {
    token: helper.token,
    body: { on: true },
  })
  assert.equal(stamp.status, 403)

  const late = await devLogin(api, '老周', 'device-outsider002')
  const lateMatch = await api('GET', '/api/match/next', { token: late.token })
  assert.equal(lateMatch.data.post.id, postId)
  await api('POST', `/api/posts/${postId}/close`, { token: author.token })
  const closed = await api('POST', `/api/posts/${postId}/replies`, {
    token: late.token,
    body: { content: '来晚了' },
  })
  assert.equal(closed.status, 409)

  const strangerClose = await api('POST', `/api/posts/${postId}/close`, { token: late.token })
  assert.equal(strangerClose.status, 403)
})

test('a push failure still keeps the reply and does not burn the quota', async (t) => {
  let pushes = 0
  const api = await start(t, {
    random: () => 0,
    templates: { reply: 'tmpl-reply' },
    wechat: {
      async codeToOpenId(code) {
        return code
      },
      async checkText() {
        return { ok: true }
      },
      async sendSubscribe() {
        pushes += 1
        if (pushes === 1) throw new Error('wechat down')
        return { errcode: 0 }
      },
    },
  })
  const author = await api('POST', '/api/auth/wechat', {
    body: { code: 'author-push', nickname: '阿梨' },
  })
  const helper = await devLogin(api, '小满', 'device-helper00003')
  await api('POST', '/api/me/subscribe', { token: author.data.token, body: { purpose: 'reply' } })
  const created = await api('POST', '/api/posts', { token: author.data.token, body: samplePost })
  const matched = await api('GET', '/api/match/next', { token: helper.token })
  assert.equal(matched.data.post.id, created.data.post.id)
  const reply = await api('POST', `/api/posts/${created.data.post.id}/replies`, {
    token: helper.token,
    body: { content: '你就装没看见' },
  })
  assert.equal(reply.status, 201)
  const notes = await api('GET', '/api/notifications', { token: author.data.token })
  assert.equal(notes.data.unread, 1)

  const again = await devLogin(api, '老周', 'device-outsider003')
  const second = await api('POST', '/api/posts', { token: author.data.token, body: samplePost })
  const secondMatch = await api('GET', '/api/match/next', { token: again.token })
  assert.equal(secondMatch.data.post.id, second.data.post.id)
  await api('POST', `/api/posts/${second.data.post.id}/replies`, {
    token: again.token,
    body: { content: '额度还在，这条该推出去' },
  })
  assert.equal(pushes, 2)
  const quotaStillThere = await api('GET', '/api/notifications', { token: author.data.token })
  assert.equal(quotaStillThere.data.unread, 2)
})
