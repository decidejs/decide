import { expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { createDecider, decide } from '../src'

it('exposes typed array matchers through independent and global deciders', async () => {
  const fetch = async () =>
    Response.json({
      answers: {
        0: { type: 'choice', choice: 'billing' },
        1: { type: 'noul', noul: 0.7 },
      },
    })
  const options = { client: { apiKey: 'test-key', fetch } }
  decide.configure(options)
  for (const { matcher } of [decide, createDecider(options)]) {
    const classify = matcher([
      z.enum(['billing', 'technical']).describe('Which team should handle this?'),
      z.boolean().describe('Does this require immediate attention?'),
    ])
    const ticket = { message: 'I was charged twice' }
    const result = classify`classify ${ticket}`
    expectTypeOf(result).toEqualTypeOf<Promise<['billing' | 'technical', boolean]>>()
    const [category, urgent] = await result
    expect(category).toBe('billing')
    expect(urgent).toBe(true)
  }
})
