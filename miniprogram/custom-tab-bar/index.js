Component({
  data: {
    selected: 0,
    unread: 0,
    items: [
      { text: '首页', url: '/pages/home/home' },
      { text: '助攻', url: '/pages/match/match' },
      { text: '消息', url: '/pages/inbox/inbox' },
      { text: '我的', url: '/pages/profile/profile' },
    ],
  },
  methods: {
    onSwitch(event) {
      const index = Number(event.currentTarget.dataset.index)
      const item = this.data.items[index]
      wx.switchTab({ url: item.url })
    },
  },
})
