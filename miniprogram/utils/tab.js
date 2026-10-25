const api = require('./api')

function sync(page, index) {
  const bar = typeof page.getTabBar === 'function' ? page.getTabBar() : null
  if (bar) bar.setData({ selected: index })
  const app = getApp()
  if (!bar || !app.globalData.token) return
  api.get('/api/notifications/unread-count').then((data) => {
    bar.setData({ unread: data.count })
  }).catch(() => {})
}

function ensureLogin() {
  const app = getApp()
  if (app.globalData.token) return true
  wx.reLaunch({ url: '/pages/login/login' })
  return false
}

module.exports = { sync, ensureLogin }
