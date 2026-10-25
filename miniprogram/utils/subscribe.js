const api = require('./api')

function ask(templateId, purpose, next) {
  if (!templateId) {
    next()
    return
  }
  wx.requestSubscribeMessage({
    tmplIds: [templateId],
    success(res) {
      if (res[templateId] !== 'accept') {
        next()
        return
      }
      api.post('/api/me/subscribe', { purpose }).then(next, next)
    },
    fail() {
      next()
    },
  })
}

module.exports = { ask }
