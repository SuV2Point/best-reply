import assert from 'node:assert/strict'
import test from 'node:test'
import { pickWeighted } from '../src/match.js'

test('pickWeighted returns null when nothing is waiting', () => {
  assert.equal(pickWeighted([], () => 0), null)
})

test('pickWeighted with zero random picks the first candidate', () => {
  const picked = pickWeighted(
    [
      { id: 1, replyCount: 0 },
      { id: 2, replyCount: 3 },
    ],
    () => 0,
  )
  assert.equal(picked.id, 1)
})

test('pickWeighted with almost-one random picks the last candidate', () => {
  const picked = pickWeighted(
    [
      { id: 1, replyCount: 0 },
      { id: 2, replyCount: 3 },
    ],
    () => 0.999999,
  )
  assert.equal(picked.id, 2)
})

test('posts with fewer replies are drawn more often', () => {
  const items = [
    { id: 'fresh', replyCount: 0 },
    { id: 'busy', replyCount: 10 },
  ]
  let fresh = 0
  for (let i = 0; i < 2000; i += 1) fresh += pickWeighted(items).id === 'fresh' ? 1 : 0
  assert.ok(fresh > 1500, `expected fresh posts to dominate, got ${fresh}/2000`)
})
