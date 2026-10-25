const session = require('./utils/session')

App({
  globalData: {
    token: '',
    user: null,
  },
  onLaunch() {
    session.restore()
  },
})
