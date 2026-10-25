import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { openDatabase } from './db.js'
import { seedIfEmpty } from './seed.js'
import { createWechatClient } from './wechat.js'

const dbPath = process.env.DB_PATH || fileURLToPath(new URL('../data/app.db', import.meta.url))
const database = openDatabase(dbPath)

if (process.env.SEED === '1') {
  const created = seedIfEmpty(database)
  if (created > 0) console.log(`seeded ${created} posts`)
}

const wechat = process.env.WX_APPID && process.env.WX_SECRET
  ? createWechatClient({ appId: process.env.WX_APPID, secret: process.env.WX_SECRET })
  : null

const app = createApp({
  db: database,
  wechat,
  templates: {
    reply: process.env.WX_TEMPLATE_REPLY || '',
    godAssist: process.env.WX_TEMPLATE_GOD || '',
  },
})

const port = Number(process.env.PORT || 8787)
app.listen(port, () => {
  console.log(`best-reply api listening on ${port}`)
})
