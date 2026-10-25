function clientId() {
  let id = wx.getStorageSync('clientId')
  if (!id) {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
    id = ''
    for (let index = 0; index < 16; index += 1) {
      id += alphabet[Math.floor(Math.random() * alphabet.length)]
    }
    wx.setStorageSync('clientId', id)
  }
  return id
}

function save(token, user) {
  const app = getApp()
  app.globalData.token = token
  app.globalData.user = user
  wx.setStorageSync('token', token)
  wx.setStorageSync('user', user)
}

function clear() {
  const app = getApp()
  app.globalData.token = ''
  app.globalData.user = null
  wx.removeStorageSync('token')
  wx.removeStorageSync('user')
}

function resetIdentity() {
  clear()
  wx.removeStorageSync('clientId')
}

function restore() {
  const app = getApp()
  app.globalData.token = wx.getStorageSync('token') || ''
  app.globalData.user = wx.getStorageSync('user') || null
  return Boolean(app.globalData.token)
}

module.exports = {
  clientId,
  save,
  clear,
  resetIdentity,
  restore,
}
