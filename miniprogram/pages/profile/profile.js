const api = require('../../utils/api')
const { formatTime } = require('../../utils/format')
const session = require('../../utils/session')
const tab = require('../../utils/tab')

Page({
  data: {
    loading: true,
    error: '',
    me: {},
    replies: [],
  },

  onShow() {
    if (!tab.ensureLogin()) return
    tab.sync(this, 3)
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  load() {
    this.setData({
      loading: !this.data.me.nickname,
      error: '',
    })
    return Promise.all([
      api.get('/api/me'),
      api.get('/api/me/replies'),
    ]).then(([me, history]) => {
      const user = { id: me.id, nickname: me.nickname }
      getApp().globalData.user = user
      wx.setStorageSync('user', user)
      this.setData({
        loading: false,
        error: '',
        me,
        replies: history.replies.map((reply) => ({
          ...reply,
          timeText: formatTime(reply.createdAt),
          sceneText: reply.post.scene || '一段对话',
        })),
      })
    }).catch((error) => {
      this.setData({ loading: false, error: error.message || '没加载出来' })
    })
  },

  onOpen(event) {
    wx.navigateTo({ url: `/pages/post/post?id=${event.currentTarget.dataset.id}` })
  },

  onSwitch() {
    wx.showModal({
      title: '换一个身份',
      content: '这个手机会变成一个新用户，方便你自己试发帖和助攻。',
      confirmText: '换',
      success: (res) => {
        if (!res.confirm) return
        session.resetIdentity()
        wx.reLaunch({ url: '/pages/login/login' })
      },
    })
  },
})
