const api = require('../../utils/api')
const { formatTime } = require('../../utils/format')
const tab = require('../../utils/tab')

Page({
  data: {
    loading: true,
    post: null,
    error: '',
  },

  onLoad(query) {
    this.postId = query.id
  },

  onShow() {
    if (!tab.ensureLogin()) return
    if (!this.postId) {
      this.setData({ loading: false, error: '找不到这条求助' })
      return
    }
    this.load()
  },

  load() {
    return api.get(`/api/posts/${this.postId}`).then((data) => {
      const post = data.post
      const me = getApp().globalData.user
      post.isAuthor = Boolean(me && post.author.id === me.id)
      post.sceneText = post.scene || '一段对话'
      post.timeText = formatTime(post.createdAt)
      post.replies = (post.replies || []).map((reply) => ({
        ...reply,
        timeText: formatTime(reply.createdAt),
      }))
      this.setData({ loading: false, post, error: '' })
      if (post.isAuthor) api.post(`/api/posts/${this.postId}/read`).catch(() => {})
    }).catch((error) => {
      this.setData({ loading: false, post: null, error: error.message || '打不开' })
    })
  },

  onCopy(event) {
    wx.setClipboardData({ data: event.currentTarget.dataset.content || '' })
  },

  onStamp(event) {
    const id = Number(event.currentTarget.dataset.id)
    const next = Number(event.currentTarget.dataset.on) !== 1
    api.post(`/api/replies/${id}/god-assist`, { on: next }).then((data) => {
      const replies = this.data.post.replies.map((reply) => (
        reply.id === id ? { ...reply, godAssist: data.reply.godAssist } : reply
      ))
      replies.sort((left, right) => {
        if (left.godAssist !== right.godAssist) return Number(right.godAssist) - Number(left.godAssist)
        return right.id - left.id
      })
      this.setData({ 'post.replies': replies, error: '' })
    }).catch((error) => {
      this.setData({ error: error.message || '没盖上' })
    })
  },

  onClose() {
    wx.showModal({
      title: '收起这条求助',
      content: '收起后不会再被匹配到。已经收到的回复还在。',
      confirmText: '收起',
      success: (res) => {
        if (!res.confirm) return
        api.post(`/api/posts/${this.postId}/close`).then(() => this.load()).catch((error) => {
          this.setData({ error: error.message || '没收起' })
        })
      },
    })
  },
})
