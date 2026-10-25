const api = require('../../utils/api')
const config = require('../../utils/config')
const subscribe = require('../../utils/subscribe')
const tab = require('../../utils/tab')

Page({
  data: {
    loading: true,
    submitting: false,
    post: null,
    content: '',
    error: '',
  },

  onShow() {
    if (!tab.ensureLogin()) return
    tab.sync(this, 1)
    if (!this.data.post) this.load()
  },

  load() {
    this.setData({ loading: true, error: '' })
    return api.get('/api/match/next').then((data) => {
      const post = data.post
      if (post) {
        post.sceneText = post.scene || '一段对话'
        post.replyHint = post.replyCount > 0 ? `已有 ${post.replyCount} 人接过，你还可以给另一句` : ''
      }
      this.setData({
        loading: false,
        post,
        content: '',
      })
    }).catch((error) => {
      this.setData({ loading: false, error: error.message || '没找到帖子' })
    })
  },

  onContent(event) {
    this.setData({ content: event.detail.value })
  },

  onSkip() {
    if (!this.data.post || this.data.submitting || this.sending) return
    this.sending = true
    this.setData({ submitting: true, error: '' })
    api.post(`/api/posts/${this.data.post.id}/skip`).then(() => {
      this.sending = false
      this.setData({ submitting: false, post: null, loading: true, content: '' })
      this.load()
    }).catch((error) => {
      this.sending = false
      this.setData({ submitting: false, error: error.message || '没换掉' })
    })
  },

  onSend() {
    const content = this.data.content.trim()
    if (!this.data.post || this.data.submitting || this.sending) return
    if (!content) {
      this.setData({ error: '先写一句能直接发出去的' })
      return
    }
    this.sending = true
    this.setData({ submitting: true, error: '' })
    subscribe.ask(config.godTemplateId, 'god_assist', () => {
      api.post(`/api/posts/${this.data.post.id}/replies`, { content }).then(() => {
        wx.showToast({ title: '已送到对方', icon: 'success' })
        this.sending = false
        this.setData({ submitting: false, post: null, loading: true, content: '' })
        this.load()
      }).catch((error) => {
        this.sending = false
        this.setData({ submitting: false, error: error.message || '没送出去' })
      })
    })
  },

  onCompose() {
    wx.navigateTo({ url: '/pages/compose/compose' })
  },
})
