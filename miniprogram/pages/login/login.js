const api = require('../../utils/api')
const config = require('../../utils/config')
const session = require('../../utils/session')

Page({
  data: {
    nickname: '',
    error: '',
    submitting: false,
    wechat: config.authMode === 'wechat',
  },

  onLoad() {
    if (session.restore()) wx.switchTab({ url: '/pages/home/home' })
  },

  onNickname(event) {
    this.setData({ nickname: event.detail.value })
  },

  onEnter() {
    const nickname = this.data.nickname.trim()
    if (!nickname) {
      this.setData({ error: '先起个昵称' })
      return
    }
    if (this.data.submitting) return
    this.setData({ submitting: true, error: '' })
    if (config.authMode === 'wechat') {
      wx.login({
        success: (res) => {
          if (!res.code) {
            this.setData({ submitting: false, error: '微信登录失败' })
            return
          }
          this.finish(api.post('/api/auth/wechat', { code: res.code, nickname }))
        },
        fail: () => {
          this.setData({ submitting: false, error: '微信登录失败' })
        },
      })
      return
    }
    this.finish(api.post('/api/auth/dev', {
      nickname,
      clientId: session.clientId(),
    }))
  },

  finish(pending) {
    pending.then((data) => {
      session.save(data.token, data.user)
      wx.switchTab({ url: '/pages/home/home' })
    }).catch((error) => {
      this.setData({ submitting: false, error: error.message || '登录失败' })
    })
  },
})
