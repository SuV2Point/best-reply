export function createWechatClient({ appId, secret, fetchImpl = fetch, now = () => Date.now() }) {
  let cached = null

  async function accessToken() {
    if (cached && cached.expiresAt > now() + 60_000) return cached.token
    const url = new URL('https://api.weixin.qq.com/cgi-bin/token')
    url.searchParams.set('grant_type', 'client_credential')
    url.searchParams.set('appid', appId)
    url.searchParams.set('secret', secret)
    const response = await fetchImpl(url)
    const data = await response.json()
    if (!data.access_token) throw new Error(data.errmsg || 'access token failed')
    cached = {
      token: data.access_token,
      expiresAt: now() + Number(data.expires_in) * 1000,
    }
    return cached.token
  }

  return {
    accessToken,
    async codeToOpenId(code) {
      const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
      url.searchParams.set('appid', appId)
      url.searchParams.set('secret', secret)
      url.searchParams.set('js_code', code)
      url.searchParams.set('grant_type', 'authorization_code')
      const response = await fetchImpl(url)
      const data = await response.json()
      if (!data.openid) throw new Error(data.errmsg || 'login failed')
      return data.openid
    },
    async checkText({ openid, content }) {
      const token = await accessToken()
      const response = await fetchImpl(
        `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ openid, scene: 2, version: 2, content }),
        },
      )
      const data = await response.json()
      if (data.errcode) throw new Error(data.errmsg || 'sec check failed')
      return { ok: data.result?.suggest !== 'risky' }
    },
    async sendSubscribe({ openid, templateId, page, data }) {
      const token = await accessToken()
      const response = await fetchImpl(
        `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            touser: openid,
            template_id: templateId,
            page,
            miniprogram_state: 'formal',
            lang: 'zh_CN',
            data,
          }),
        },
      )
      return response.json()
    },
  }
}
