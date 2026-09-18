import { TypeSafeClient } from '@typesafe-ai/sdk'
import { expect, it } from 'vitest'
import { z } from 'zod'
import { createDecider, decide } from '../src'

it('reuses an existing SDK client for global and independent decisions', async () => {
  const client = new TypeSafeClient({
    apiKey: 'test-key',
    fetch: async () =>
      Response.json({
        answers: {
          decision: { type: 'noul', noul: 0.7 },
          urgent: { type: 'noul', noul: 0.7 },
        },
      }),
  })
  decide.configure({ client })
  const { yes, matcher } = createDecider({ client, threshold: 0.8 })

  await expect(decide.yes`urgent?`).resolves.toBe(true)
  await expect(yes`urgent?`).resolves.toBe(false)
  await expect(matcher({ urgent: z.boolean() })`classify`).resolves.toEqual({ urgent: false })
  await expect(yes({ threshold: 0.6 })`urgent?`).resolves.toBe(true)
})
