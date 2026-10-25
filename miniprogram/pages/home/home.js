const api = require('../../utils/api')
const { formatTime } = require('../../utils/format')
const tab = require('../../utils/tab')

Page({
  data: {
    loading: true,
    error: '',
    posts: [],
    waitingText: '看看谁正卡着',
  },

  onShow() {
    if (!tab.ensureLogin()) return
    tab.sync(this, 0)
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  load() {
    this.setData({
      loading: this.data.posts.length === 0,
      error: '',
    })
    return Promise.all([
      api.get('/api/posts/mine'),
      api.get('/api/match/waiting-count'),
    ]).then(([mine, waiting]) => {
      const posts = mine.posts.map((post) => ({
        ...post,
        timeText: formatTime(post.createdAt),
        sceneText: post.scene || '一段对话',
      }))
      const waitingText = waiting.count > 0
        ? `还有 ${waiting.count} 条没处理`
        : '这会儿没有待处理的'
      this.setData({ loading: false, posts, waitingText })
    }).catch((error) => {
      this.setData({ loading: false, error: error.message || '加载失败' })
    })
  },

  onCompose() {
    wx.navigateTo({ url: '/pages/compose/compose' })
  },

  onMatch() {
    wx.switchTab({ url: '/pages/match/match' })
  },

  onOpen(event) {
    wx.navigateTo({ url: `/pages/post/post?id=${event.currentTarget.dataset.id}` })
  },
})
