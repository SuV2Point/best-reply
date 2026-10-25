import { HttpError } from './errors.js'

const CLIENT_ID = /^[a-zA-Z0-9_-]{8,64}$/

function lengthOf(value) {
  return Array.from(value).length
}

export function parseNickname(value) {
  const nickname = String(value ?? '').trim()
  const length = lengthOf(nickname)
  if (length < 1 || length > 16) {
    throw new HttpError(400, 'invalid', '昵称需要 1 到 16 个字')
  }
  return nickname
}

export function parseClientId(value) {
  const clientId = String(value ?? '')
  if (!CLIENT_ID.test(clientId)) {
    throw new HttpError(400, 'invalid', '设备标识不正确')
  }
  return clientId
}

export function parsePost(input) {
  const scene = String(input?.scene ?? '').trim()
  if (lengthOf(scene) > 40) {
    throw new HttpError(400, 'invalid', '场景最多 40 个字')
  }
  const ask = String(input?.ask ?? '').trim()
  if (lengthOf(ask) < 1 || lengthOf(ask) > 120) {
    throw new HttpError(400, 'invalid', '用一两句话说明你卡在哪里')
  }
  if (!Array.isArray(input?.messages) || input.messages.length < 1 || input.messages.length > 20) {
    throw new HttpError(400, 'invalid', '请贴上 1 到 20 句对话')
  }
  const messages = input.messages.map((message) => {
    if (message?.role !== 'me' && message?.role !== 'other') {
      throw new HttpError(400, 'invalid', '每一句都要标明是你还是对方')
    }
    const text = String(message?.text ?? '').trim()
    if (lengthOf(text) < 1 || lengthOf(text) > 300) {
      throw new HttpError(400, 'invalid', '每一句需要 1 到 300 个字')
    }
    return { role: message.role, text }
  })
  return { scene, ask, messages }
}

export function parseReply(input) {
  const content = String(input?.content ?? '').trim()
  if (lengthOf(content) < 1 || lengthOf(content) > 300) {
    throw new HttpError(400, 'invalid', '回复需要 1 到 300 个字')
  }
  return content
}

export function parsePurpose(value) {
  if (value !== 'reply' && value !== 'god_assist') {
    throw new HttpError(400, 'invalid', '订阅类型不正确')
  }
  return value
}

export function parseBoolean(value) {
  if (typeof value !== 'boolean') {
    throw new HttpError(400, 'invalid', '请标明要不要标成神助攻')
  }
  return value
}

export function parseId(value) {
  const id = Number(value)
  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(400, 'invalid', '编号不正确')
  }
  return id
}

export function parseLimit(value) {
  if (value === undefined) return 20
  const limit = Number(value)
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new HttpError(400, 'invalid', '分页参数不正确')
  }
  return limit
}

export function parseOffset(value) {
  if (value === undefined) return 0
  const offset = Number(value)
  if (!Number.isInteger(offset) || offset < 0) {
    throw new HttpError(400, 'invalid', '分页参数不正确')
  }
  return offset
}
