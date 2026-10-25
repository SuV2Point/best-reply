const api = require('../../utils/api')
const config = require('../../utils/config')
const subscribe = require('../../utils/subscribe')

function lengthOf(value) {
  return Array.from(value).length
}

Page({
  data: {
    scene: '',
    ask: '',
    draft: '',
    role: 'other',
    messages: [],
    error: '',
    submitting: false,
  },

  onScene(event) {
    this.setData({ scene: event.detail.value })
  },

  onAsk(event) {
    this.setData({ ask: event.detail.value })
  },

  onDraft(event) {
    this.setData({ draft: event.detail.value })
  },

  onRole(event) {
    this.setData({ role: event.currentTarget.dataset.role })
  },

  onAdd() {
    const text = this.data.draft.trim()
    if (!text) {
      this.setData({ error: '先写上一句原话' })
      return
    }
    if (lengthOf(text) > 300) {
      this.setData({ error: '一句最多 300 个字' })
      return
    }
    if (this.data.messages.length >= 20) {
      this.setData({ error: '最多贴 20 句' })
      return
    }
    this.setData({
      error: '',
      draft: '',
      messages: this.data.messages.concat({ role: this.data.role, text }),
    })
  },

  onRemove(event) {
    const index = event.detail.index
    this.setData({
      messages: this.data.messages.filter((_, itemIndex) => itemIndex !== index),
    })
  },

  onPublish() {
    if (this.data.submitting || this.publishing) return
    const ask = this.data.ask.trim()
    if (this.data.messages.length === 0) {
      this.setData({ error: '至少贴上一句对话' })
      return
    }
    if (!ask) {
      this.setData({ error: '说说你卡在哪里' })
      return
    }
    this.publishing = true
    this.setData({ submitting: true, error: '' })
    subscribe.ask(config.replyTemplateId, 'reply', () => {
      api.post('/api/posts', {
        scene: this.data.scene.trim(),
        ask,
        messages: this.data.messages.map((message) => ({
          role: message.role,
          text: message.text,
        })),
      }).then((data) => {
        wx.redirectTo({ url: `/pages/post/post?id=${data.post.id}` })
      }).catch((error) => {
        this.publishing = false
        this.setData({ submitting: false, error: error.message || '没发出去' })
      })
    })
  },
})
