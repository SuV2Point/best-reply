const api = require('../../utils/api')
const { formatTime } = require('../../utils/format')
const tab = require('../../utils/tab')

Page({
  data: {
    loading: true,
    error: '',
    notes: [],
  },

  onShow() {
    if (!tab.ensureLogin()) return
    tab.sync(this, 2)
    this.load()
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh(), () => wx.stopPullDownRefresh())
  },

  load() {
    this.setData({
      loading: this.data.notes.length === 0,
      error: '',
    })
    return api.get('/api/notifications').then((data) => {
      this.setData({
        loading: false,
        error: '',
        notes: data.notifications.map((note) => ({
          ...note,
          timeText: formatTime(note.createdAt),
        })),
      })
    }).catch((error) => {
      this.setData({ loading: false, error: error.message || '没取到消息' })
    })
  },

  onOpen(event) {
    const { id, post } = event.currentTarget.dataset
    const open = () => wx.navigateTo({ url: `/pages/post/post?id=${post}` })
    api.post(`/api/notifications/${id}/read`).then(open, open)
  },
})
