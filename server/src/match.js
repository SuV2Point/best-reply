export function pickWeighted(items, random = Math.random) {
  if (items.length === 0) return null
  const weights = items.map((item) => 1 / (1 + item.replyCount))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let ticket = random() * total
  for (let index = 0; index < items.length; index += 1) {
    ticket -= weights[index]
    if (ticket <= 0) return items[index]
  }
  return items[items.length - 1]
}
