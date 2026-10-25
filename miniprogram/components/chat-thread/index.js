Component({
  properties: {
    messages: { type: Array, value: [] },
    editable: { type: Boolean, value: false },
    markLast: { type: Boolean, value: false },
  },
  methods: {
    onRemove(event) {
      this.triggerEvent('remove', { index: Number(event.currentTarget.dataset.index) })
    },
  },
})
