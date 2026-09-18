import { expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { createDecider } from '../src'

it('routes an issue using a typed enum decision', async () => {
  const { match } = createDecider({
    apiKey: 'test-key',
    fetch: async () => Response.json({ answers: { decision: { type: 'choice', choice: 'bug' } } }),
  })
  const issue = { title: 'Crashes on startup' }
  const classify = match(z.enum(['bug', 'feature', 'question']))
  const result = classify`what kind of issue is ${issue}?`
  expectTypeOf(result).toEqualTypeOf<Promise<'bug' | 'feature' | 'question'>>()

  let destination: string | undefined
  switch (await result) {
    case 'bug':
      destination = 'engineering'
      break
    case 'feature':
      destination = 'product'
      break
    case 'question':
      destination = 'support'
      break
  }
  expect(destination).toBe('engineering')
})
