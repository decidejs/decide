import { expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'
import { decide } from '../src'

it('reuses a typed matcher to classify tickets in one request per invocation', async () => {
  const { configure, matcher } = decide
  const fetch = vi.fn(async () =>
    Response.json({
      answers: {
        category: { type: 'choice', choice: 'billing' },
        urgent: { type: 'noul', noul: 0.7 },
      },
    }),
  )
  configure({ apiKey: 'test-key', fetch })
  const classify = matcher({
    category: z.enum(['billing', 'technical']).describe('Which team should handle this?'),
    urgent: z.boolean().describe('Does this require immediate attention?'),
  })
  const ticket = { message: 'I was charged twice' }
  const result = classify`classify ${ticket}`
  expectTypeOf(result).toEqualTypeOf<
    Promise<{ category: 'billing' | 'technical'; urgent: boolean }>
  >()
  const { category, urgent } = await result
  expect({ category, urgent }).toEqual({ category: 'billing', urgent: true })
  expect(fetch).toHaveBeenCalledTimes(1)

  await expect(classify({ threshold: 0.8 })`classify ${ticket}`).resolves.toEqual({
    category: 'billing',
    urgent: false,
  })
  expect(fetch).toHaveBeenCalledTimes(2)
})
