import { expect, expectTypeOf, it } from 'vitest'
import type { Decisions } from '../src'
import { createDecider, decide } from '../src'

it('creates independent deciders with destructurable methods', async () => {
  const fetch = async () => Response.json({ answers: { decision: { type: 'noul', noul: 0.7 } } })
  const normal = createDecider({ apiKey: 'test-key', fetch })
  const strict = createDecider({ apiKey: 'test-key', fetch, threshold: 0.8 })
  expectTypeOf(normal).toEqualTypeOf<Decisions>()
  expect(normal).not.toHaveProperty('configure')

  const { yes, no } = strict
  await expect(normal.yes`acceptable?`).resolves.toBe(true)
  await expect(yes`acceptable?`).resolves.toBe(false)
  await expect(no`acceptable?`).resolves.toBe(false)
  await expect(yes({ threshold: 0.6 })`acceptable?`).resolves.toBe(true)

  decide.configure({ apiKey: 'test-key', fetch, threshold: 1 })
  await expect(decide.yes`acceptable?`).resolves.toBe(false)
  await expect(normal.yes`acceptable?`).resolves.toBe(true)
})
