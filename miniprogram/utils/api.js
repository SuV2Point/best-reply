const config = require('./config')
const session = require('./session')

function request(method, path, data) {
  const app = getApp()
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.apiBase}${path}`,
      method,
      data,
      header: {
        'content-type': 'application/json',
        Authorization: app.globalData.token ? `Bearer ${app.globalData.token}` : '',
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
          return
        }
        const message = res.data && res.data.error ? res.data.error.message : '请求失败'
        if (res.statusCode === 401 && path.indexOf('/api/auth/') !== 0) {
          session.clear()
          wx.reLaunch({ url: '/pages/login/login' })
        }
        const error = new Error(message)
        error.status = res.statusCode
        reject(error)
      },
      fail() {
        reject(new Error('连不上服务器。先启动后端，并确认开发者工具已关闭域名校验'))
      },
    })
  })
}

module.exports = {
  get(path) {
    return request('GET', path)
  },
  post(path, data) {
    return request('POST', path, data)
  },
}
