const SAMPLES = [
  {
    nickname: '阿梨',
    openid: 'dev:seed-ali1',
    scene: '前任',
    ask: '凌晨这句，回也不是，不回也不是',
    messages: [
      { role: 'other', text: '睡了吗' },
      { role: 'me', text: '还没' },
      { role: 'other', text: '那我打给你？' },
    ],
  },
  {
    nickname: '小满',
    openid: 'dev:seed-man2',
    scene: '直属领导',
    ask: '我不想去团建，但这句接太硬了',
    messages: [
      { role: 'other', text: '周六团建，你没什么事吧' },
      { role: 'me', text: '我看一下' },
      { role: 'other', text: '都来，你也别扫兴' },
    ],
  },
  {
    nickname: '老周',
    openid: 'dev:seed-zhou',
    scene: '相亲对象',
    ask: '刚加上第二天，不知道怎么接才不像在查户口',
    messages: [
      { role: 'other', text: '你平时周末都干嘛' },
      { role: 'me', text: '看看电影，或者睡觉' },
      { role: 'other', text: '那这周末出来吃饭？我订位子' },
    ],
  },
  {
    nickname: '陈晨',
    openid: 'dev:seed-chen',
    scene: '大学同学',
    ask: '想拒绝借钱，又不想把关系说死',
    messages: [
      { role: 'other', text: '在吗，想问你借两千，下个月工资一发就还' },
      { role: 'me', text: '怎么了' },
      { role: 'other', text: '房租差一截，真的急' },
    ],
  },
]

export function seedIfEmpty(db) {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM posts').get()
  if (Number(existing.n) > 0) return 0
  const insertUser = db.prepare(
    'INSERT INTO users (openid, nickname, token, created_at) VALUES (?, ?, ?, ?)',
  )
  const insertPost = db.prepare(`
    INSERT INTO posts (author_id, scene, ask, messages_json, status, created_at)
    VALUES (?, ?, ?, ?, 'open', ?)
  `)
  const now = new Date().toISOString()
  for (const sample of SAMPLES) {
    const user = insertUser.run(sample.openid, sample.nickname, `seed-${sample.openid}`, now)
    insertPost.run(
      Number(user.lastInsertRowid),
      sample.scene,
      sample.ask,
      JSON.stringify(sample.messages),
      now,
    )
  }
  return SAMPLES.length
}
