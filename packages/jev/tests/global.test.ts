import { expect, it } from 'vitest'
import { decide } from '../src'

it('uses a configured global decision in ordinary control flow', async () => {
  const { configure, yes, no } = decide
  await expect(yes`is this acceptable?`).rejects.toThrow('decide.configure')
  configure({
    client: {
      apiKey: 'test-key',
      fetch: async () => Response.json({ answers: { decision: { type: 'noul', noul: 0.5 } } }),
    },
  })

  const message = { text: 'Hello' }
  const published = []
  if (await yes`is ${message} safe to publish?`) published.push(message)
  expect(published).toEqual([message])
  await expect(no`is ${message} safe to publish?`).resolves.toBe(false)
  await expect(yes({ threshold: 0.8 })`is ${message} safe to publish?`).resolves.toBe(false)
  await expect(no({ threshold: 0.8 })`is ${message} safe to publish?`).resolves.toBe(true)
})
