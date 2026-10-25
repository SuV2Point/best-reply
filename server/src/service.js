import { randomBytes } from 'node:crypto'
import { HttpError } from './errors.js'
import { pickWeighted } from './match.js'
import { clip, formatShanghai } from './time.js'
import {
  parseBoolean,
  parseClientId,
  parseId,
  parseLimit,
  parseNickname,
  parseOffset,
  parsePost,
  parsePurpose,
  parseReply,
} from './validate.js'

function row(record) {
  return record ? { ...record } : null
}

function countOf(record) {
  return Number(record.n)
}

export function createService(db, {
  random = Math.random,
  wechat = null,
  templates = {},
  now = () => new Date(),
} = {}) {
  const timestamp = () => now().toISOString()

  function findByToken(token) {
    return row(db.prepare('SELECT * FROM users WHERE token = ?').get(token))
  }

  function userById(id) {
    return row(db.prepare('SELECT * FROM users WHERE id = ?').get(id))
  }

  function loadPost(id) {
    return row(db.prepare(`
      SELECT p.*, u.nickname AS author_nickname,
        (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS reply_count,
        (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id AND r.god_assist = 1) AS god_assist_count,
        (SELECT COUNT(*) FROM notifications n
          WHERE n.post_id = p.id AND n.user_id = p.author_id AND n.type = 'reply' AND n.read_at IS NULL
        ) AS unread_reply_count
      FROM posts p
      JOIN users u ON u.id = p.author_id
      WHERE p.id = ?
    `).get(id))
  }

  function loadReply(id) {
    return row(db.prepare(`
      SELECT r.*, u.nickname AS author_nickname
      FROM replies r
      JOIN users u ON u.id = r.author_id
      WHERE r.id = ?
    `).get(id))
  }

  function mapPost(record) {
    return {
      id: record.id,
      scene: record.scene,
      ask: record.ask,
      messages: JSON.parse(record.messages_json),
      status: record.status,
      createdAt: record.created_at,
      author: { id: record.author_id, nickname: record.author_nickname },
      replyCount: Number(record.reply_count),
      godAssistCount: Number(record.god_assist_count),
      unreadReplyCount: Number(record.unread_reply_count ?? 0),
    }
  }

  function mapReply(record) {
    return {
      id: record.id,
      postId: record.post_id,
      content: record.content,
      godAssist: Number(record.god_assist) === 1,
      createdAt: record.created_at,
      author: { id: record.author_id, nickname: record.author_nickname },
    }
  }

  function upsertUser(openid, nickname) {
    const existing = row(db.prepare('SELECT * FROM users WHERE openid = ?').get(openid))
    if (existing) {
      db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(nickname, existing.id)
      return { token: existing.token, user: { id: existing.id, nickname } }
    }
    const token = randomBytes(24).toString('hex')
    const info = db.prepare(
      'INSERT INTO users (openid, nickname, token, created_at) VALUES (?, ?, ?, ?)',
    ).run(openid, nickname, token, timestamp())
    return { token, user: { id: Number(info.lastInsertRowid), nickname } }
  }

  async function moderate(user, text) {
    if (!wechat?.checkText || !text) return
    let result
    try {
      result = await wechat.checkText({ openid: user.openid, content: text })
    } catch {
      return
    }
    if (result?.ok === false) {
      throw new HttpError(400, 'rejected', '内容未通过安全检测')
    }
  }

  function quotaColumn(purpose) {
    switch (purpose) {
      case 'reply':
        return 'reply_quota'
      case 'god_assist':
        return 'god_quota'
      default: {
        const unknown = purpose
        throw new Error(`unknown subscribe purpose: ${unknown}`)
      }
    }
  }

  function changeQuota(userId, purpose, delta) {
    const column = quotaColumn(purpose)
    const info = db.prepare(
      `UPDATE users SET ${column} = ${column} + ? WHERE id = ? AND ${column} + ? >= 0`,
    ).run(delta, userId, delta)
    return info.changes === 1
  }

  function templateFor(purpose) {
    switch (purpose) {
      case 'reply':
        return templates.reply || ''
      case 'god_assist':
        return templates.godAssist || ''
      default: {
        const unknown = purpose
        throw new Error(`unknown subscribe purpose: ${unknown}`)
      }
    }
  }

  async function push({ recipientId, purpose, post, replyContent }) {
    const templateId = templateFor(purpose)
    if (!templateId || !wechat?.sendSubscribe) return
    const recipient = userById(recipientId)
    if (!recipient?.openid || recipient.openid.startsWith('dev:')) return
    const reserved = changeQuota(recipient.id, purpose, -1)
    if (!reserved) return
    const thing1 = purpose === 'god_assist' ? '你的回复被标成了神助攻' : post.ask
    try {
      const result = await wechat.sendSubscribe({
        openid: recipient.openid,
        templateId,
        page: `pages/post/post?id=${post.id}`,
        data: {
          thing1: { value: clip(thing1, 20) },
          thing2: { value: clip(replyContent, 20) },
          time3: { value: formatShanghai(now()) },
        },
      })
      if (!result || result.errcode !== 0) return
    } catch {
      changeQuota(recipient.id, purpose, 1)
    }
  }

  function notify({ userId, type, postId, replyId, actorId }) {
    const info = db.prepare(`
      INSERT OR IGNORE INTO notifications (user_id, type, post_id, reply_id, actor_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, type, postId, replyId, actorId, timestamp())
    return info.changes === 1
  }

  function notificationTitle(type, actorNickname) {
    switch (type) {
      case 'reply':
        return `${actorNickname} 接了一句`
      case 'god_assist':
        return '你的回复被标成了神助攻'
      default: {
        const unknown = type
        throw new Error(`unknown notification type: ${unknown}`)
      }
    }
  }

  return {
    findByToken,

    loginDev(input) {
      const nickname = parseNickname(input?.nickname)
      const clientId = parseClientId(input?.clientId)
      return upsertUser(`dev:${clientId}`, nickname)
    },

    async loginWechat(input) {
      const nickname = parseNickname(input?.nickname)
      if (!wechat?.codeToOpenId) {
        throw new HttpError(400, 'unconfigured', '还没有配置微信登录')
      }
      let openid
      try {
        openid = await wechat.codeToOpenId(String(input?.code ?? ''))
      } catch {
        throw new HttpError(401, 'unauthorized', '微信登录失败')
      }
      if (!openid) throw new HttpError(401, 'unauthorized', '微信登录失败')
      return upsertUser(openid, nickname)
    },

    profile(user) {
      const posts = countOf(db.prepare('SELECT COUNT(*) AS n FROM posts WHERE author_id = ?').get(user.id))
      const replies = countOf(db.prepare('SELECT COUNT(*) AS n FROM replies WHERE author_id = ?').get(user.id))
      const godAssists = countOf(db.prepare(
        'SELECT COUNT(*) AS n FROM replies WHERE author_id = ? AND god_assist = 1',
      ).get(user.id))
      const unread = countOf(db.prepare(
        'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL',
      ).get(user.id))
      return {
        id: user.id,
        nickname: user.nickname,
        stats: { posts, replies, godAssists, unread },
      }
    },

    subscribe(user, input) {
      const purpose = parsePurpose(input?.purpose)
      changeQuota(user.id, purpose, 1)
      return { ok: true }
    },

    async createPost(user, input) {
      const parsed = parsePost(input)
      await moderate(user, [parsed.scene, parsed.ask, ...parsed.messages.map((message) => message.text)].filter(Boolean).join('\n'))
      const info = db.prepare(`
        INSERT INTO posts (author_id, scene, ask, messages_json, status, created_at)
        VALUES (?, ?, ?, ?, 'open', ?)
      `).run(user.id, parsed.scene, parsed.ask, JSON.stringify(parsed.messages), timestamp())
      return mapPost(loadPost(Number(info.lastInsertRowid)))
    },

    listMine(user, query) {
      const limit = parseLimit(query.limit)
      const offset = parseOffset(query.offset)
      const posts = db.prepare(`
        SELECT p.*, u.nickname AS author_nickname,
          (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS reply_count,
          (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id AND r.god_assist = 1) AS god_assist_count,
          (SELECT COUNT(*) FROM notifications n
            WHERE n.post_id = p.id AND n.user_id = ? AND n.type = 'reply' AND n.read_at IS NULL
          ) AS unread_reply_count
        FROM posts p
        JOIN users u ON u.id = p.author_id
        WHERE p.author_id = ?
        ORDER BY p.id DESC
        LIMIT ? OFFSET ?
      `).all(user.id, user.id, limit, offset).map((record) => mapPost(row(record)))
      return { posts }
    },

    getPost(user, rawId) {
      const id = parseId(rawId)
      const post = loadPost(id)
      if (!post) throw new HttpError(404, 'not_found', '找不到这条求助')
      const isAuthor = post.author_id === user.id
      const dealt = db.prepare(
        'SELECT 1 AS ok FROM deals WHERE user_id = ? AND post_id = ?',
      ).get(user.id, id)
      const mine = db.prepare(
        'SELECT 1 AS ok FROM replies WHERE post_id = ? AND author_id = ?',
      ).get(id, user.id)
      if (!isAuthor && !dealt && !mine) {
        throw new HttpError(404, 'not_found', '找不到这条求助')
      }
      const replies = db.prepare(`
        SELECT r.*, u.nickname AS author_nickname
        FROM replies r
        JOIN users u ON u.id = r.author_id
        WHERE r.post_id = ? AND (? = 1 OR r.author_id = ?)
        ORDER BY r.god_assist DESC, r.id DESC
      `).all(id, isAuthor ? 1 : 0, user.id).map((record) => mapReply(row(record)))
      const mapped = mapPost(post)
      if (!isAuthor) mapped.unreadReplyCount = 0
      return { ...mapped, replies }
    },

    closePost(user, rawId) {
      const id = parseId(rawId)
      const post = loadPost(id)
      if (!post) throw new HttpError(404, 'not_found', '找不到这条求助')
      if (post.author_id !== user.id) {
        throw new HttpError(403, 'forbidden', '只有求助的人能收起这条')
      }
      db.prepare("UPDATE posts SET status = 'closed' WHERE id = ?").run(id)
      return mapPost(loadPost(id))
    },

    waitingCount(user) {
      const count = countOf(db.prepare(`
        SELECT COUNT(*) AS n FROM posts p
        WHERE p.status = 'open'
          AND p.author_id != ?
          AND NOT EXISTS (SELECT 1 FROM replies r WHERE r.post_id = p.id AND r.author_id = ?)
          AND NOT EXISTS (SELECT 1 FROM passes s WHERE s.post_id = p.id AND s.user_id = ?)
      `).get(user.id, user.id, user.id))
      return count
    },

    nextMatch(user) {
      const pending = row(db.prepare(`
        SELECT p.id
        FROM deals d
        JOIN posts p ON p.id = d.post_id
        WHERE d.user_id = ?
          AND p.status = 'open'
          AND p.author_id != ?
          AND NOT EXISTS (SELECT 1 FROM replies r WHERE r.post_id = p.id AND r.author_id = ?)
          AND NOT EXISTS (SELECT 1 FROM passes s WHERE s.post_id = p.id AND s.user_id = ?)
        ORDER BY d.created_at ASC, p.id ASC
        LIMIT 1
      `).get(user.id, user.id, user.id, user.id))
      if (pending) return mapPost(loadPost(pending.id))

      const candidates = db.prepare(`
        SELECT p.id,
          (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS reply_count
        FROM posts p
        WHERE p.status = 'open'
          AND p.author_id != ?
          AND NOT EXISTS (SELECT 1 FROM replies r WHERE r.post_id = p.id AND r.author_id = ?)
          AND NOT EXISTS (SELECT 1 FROM passes s WHERE s.post_id = p.id AND s.user_id = ?)
        ORDER BY reply_count ASC, p.id ASC
        LIMIT 100
      `).all(user.id, user.id, user.id).map((record) => ({
        id: record.id,
        replyCount: Number(record.reply_count),
      }))
      const picked = pickWeighted(candidates, random)
      if (!picked) return null
      db.prepare(
        'INSERT OR IGNORE INTO deals (user_id, post_id, created_at) VALUES (?, ?, ?)',
      ).run(user.id, picked.id, timestamp())
      return mapPost(loadPost(picked.id))
    },

    skipPost(user, rawId) {
      const id = parseId(rawId)
      const post = loadPost(id)
      if (!post) throw new HttpError(404, 'not_found', '找不到这条求助')
      if (post.author_id === user.id) {
        throw new HttpError(403, 'forbidden', '不用跳过自己的求助')
      }
      const dealt = db.prepare(
        'SELECT 1 AS ok FROM deals WHERE user_id = ? AND post_id = ?',
      ).get(user.id, id)
      if (!dealt) throw new HttpError(403, 'forbidden', '先从助攻里领取这一题')
      db.prepare(
        'INSERT OR IGNORE INTO passes (user_id, post_id, created_at) VALUES (?, ?, ?)',
      ).run(user.id, id, timestamp())
      return { ok: true }
    },

    async reply(user, rawId, input) {
      const postId = parseId(rawId)
      const content = parseReply(input)
      const post = loadPost(postId)
      if (!post) throw new HttpError(404, 'not_found', '找不到这条求助')
      if (post.author_id === user.id) {
        throw new HttpError(403, 'forbidden', '不能接自己的求助')
      }
      if (post.status !== 'open') {
        throw new HttpError(409, 'closed', '这条求助已经收起了')
      }
      const existing = db.prepare(
        'SELECT id FROM replies WHERE post_id = ? AND author_id = ?',
      ).get(postId, user.id)
      if (existing) throw new HttpError(409, 'duplicate', '你已经接过这句了')
      const dealt = db.prepare(
        'SELECT 1 AS ok FROM deals WHERE user_id = ? AND post_id = ?',
      ).get(user.id, postId)
      if (!dealt) throw new HttpError(403, 'forbidden', '先从助攻里领取这一题')
      await moderate(user, content)
      const info = db.prepare(`
        INSERT INTO replies (post_id, author_id, content, created_at)
        VALUES (?, ?, ?, ?)
      `).run(postId, user.id, content, timestamp())
      const replyId = Number(info.lastInsertRowid)
      const created = notify({
        userId: post.author_id,
        type: 'reply',
        postId,
        replyId,
        actorId: user.id,
      })
      if (created) {
        await push({
          recipientId: post.author_id,
          purpose: 'reply',
          post,
          replyContent: content,
        })
      }
      return mapReply(loadReply(replyId))
    },

    async setGodAssist(user, rawId, input) {
      const replyId = parseId(rawId)
      const on = parseBoolean(input?.on)
      const reply = loadReply(replyId)
      if (!reply) throw new HttpError(404, 'not_found', '找不到这条回复')
      const post = loadPost(reply.post_id)
      if (post.author_id !== user.id) {
        throw new HttpError(403, 'forbidden', '只有求助的人能标神助攻')
      }
      db.prepare('UPDATE replies SET god_assist = ? WHERE id = ?').run(on ? 1 : 0, replyId)
      if (on) {
        const created = notify({
          userId: reply.author_id,
          type: 'god_assist',
          postId: post.id,
          replyId,
          actorId: user.id,
        })
        if (created) {
          await push({
            recipientId: reply.author_id,
            purpose: 'god_assist',
            post,
            replyContent: reply.content,
          })
        }
      }
      return mapReply(loadReply(replyId))
    },

    listNotifications(user, query) {
      const limit = parseLimit(query.limit)
      const offset = parseOffset(query.offset)
      const notifications = db.prepare(`
        SELECT n.*, a.nickname AS actor_nickname, r.content AS reply_content
        FROM notifications n
        JOIN users a ON a.id = n.actor_id
        JOIN replies r ON r.id = n.reply_id
        WHERE n.user_id = ?
        ORDER BY n.id DESC
        LIMIT ? OFFSET ?
      `).all(user.id, limit, offset).map((record) => ({
        id: record.id,
        type: record.type,
        title: notificationTitle(record.type, record.actor_nickname),
        body: record.reply_content,
        postId: record.post_id,
        replyId: record.reply_id,
        read: record.read_at != null,
        createdAt: record.created_at,
      }))
      const unread = countOf(db.prepare(
        'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL',
      ).get(user.id))
      return { notifications, unread }
    },

    unreadCount(user) {
      return countOf(db.prepare(
        'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL',
      ).get(user.id))
    },

    markPostRead(user, rawId) {
      const postId = parseId(rawId)
      db.prepare(`
        UPDATE notifications SET read_at = ?
        WHERE user_id = ? AND post_id = ? AND read_at IS NULL
      `).run(timestamp(), user.id, postId)
      return { ok: true }
    },

    markNotificationRead(user, rawId) {
      const id = parseId(rawId)
      const info = db.prepare(`
        UPDATE notifications SET read_at = ?
        WHERE id = ? AND user_id = ? AND read_at IS NULL
      `).run(timestamp(), id, user.id)
      if (info.changes === 0) {
        const exists = db.prepare(
          'SELECT id FROM notifications WHERE id = ? AND user_id = ?',
        ).get(id, user.id)
        if (!exists) throw new HttpError(404, 'not_found', '找不到这条通知')
      }
      return { ok: true }
    },

    listMyReplies(user, query) {
      const limit = parseLimit(query.limit)
      const offset = parseOffset(query.offset)
      const replies = db.prepare(`
        SELECT r.*, p.ask AS post_ask, p.scene AS post_scene
        FROM replies r
        JOIN posts p ON p.id = r.post_id
        WHERE r.author_id = ?
        ORDER BY r.id DESC
        LIMIT ? OFFSET ?
      `).all(user.id, limit, offset).map((record) => ({
        id: record.id,
        content: record.content,
        godAssist: Number(record.god_assist) === 1,
        createdAt: record.created_at,
        post: { id: record.post_id, ask: record.post_ask, scene: record.post_scene },
      }))
      return { replies }
    },
  }
}
