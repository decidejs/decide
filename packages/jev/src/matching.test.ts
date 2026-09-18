import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'
import * as mini from 'zod/mini'
import { createDecider, decide } from './index'

function fixture(answers: unknown, threshold?: number) {
  const fetch = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () =>
    Response.json({ answers }),
  )
  return {
    fetch,
    custom: createDecider({ apiKey: 'test-key', fetch, threshold }),
    request: (index = 0) => JSON.parse(fetch.mock.calls[index][1]?.body as string),
  }
}

describe('enum matching', () => {
  it('returns a typed enum choice from structured state', async () => {
    const { custom, request } = fixture({ decision: { type: 'choice', choice: 'bug' } })
    const issue = { title: 'Crashes on startup' }
    const result = custom.match(z.enum(['bug', 'feature', 'question']))`classify ${issue}`
    expectTypeOf(result).toEqualTypeOf<Promise<'bug' | 'feature' | 'question'>>()
    await expect(result).resolves.toBe('bug')
    expect(request()).toMatchObject({
      state: { arg0: issue },
      questions: {
        decision: {
          type: 'choice',
          instructions: 'classify `arg0`\n\nWhich option best matches?',
          criteria: { bug: null, feature: null, question: null },
        },
      },
    })
  })

  it('supports descriptions, reusable options, and Zod Mini', async () => {
    const { custom, request } = fixture({ decision: { type: 'choice', choice: 'a' } })
    const match = custom.match(z.enum(['a', 'b']).describe('Choose the best category.'))
    await expect(match({ model: 'custom-model' })`context`).resolves.toBe('a')
    expect(request().questions.decision.instructions).toBe('context\n\nChoose the best category.')
    expect(request().model).toBe('custom-model')
    const result = custom.match(mini.enum(['a', 'b']))`context`
    expectTypeOf(result).toEqualTypeOf<Promise<'a' | 'b'>>()
    await expect(result).resolves.toBe('a')
  })

  it.each([
    { type: 'choice', choice: 'outside' },
    { type: 'choice', choice: 1 },
    { type: 'noul', choice: 'a' },
  ])('rejects invalid categorical answers: %s', async (answer) => {
    const { custom } = fixture({ decision: answer })
    await expect(custom.match(z.enum(['a', 'b']))`context`).rejects.toThrow('Invalid Choice')
  })

  it('rejects unsupported schemas before making a request', () => {
    const { custom, fetch } = fixture({})
    // @ts-expect-error Unbounded strings are not categorical decisions.
    expect(() => custom.match(z.string())).toThrow('Unsupported schema')
    // @ts-expect-error Boolean decisions belong to yes/no or matcher.
    expect(() => custom.match(z.boolean())).toThrow('match requires')
    // @ts-expect-error Numeric enums are not string choices.
    expect(() => custom.match(z.enum({ A: 0, B: 1 }))).toThrow('string enum')
    expect(() => custom.match(z.enum([]))).toThrow('nonempty')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('respects async schema refinements instead of silently ignoring them', async () => {
    const { custom } = fixture({ decision: { type: 'choice', choice: 'a' } })
    const schema = z.enum(['a', 'b']).refine(async (value) => value === 'b', 'Only b is allowed')
    await expect(custom.match(schema)`context`).rejects.toThrow('Only b is allowed')
  })
})

describe('batched matchers', () => {
  it('evaluates described fields in one request and infers each result', async () => {
    const { custom, fetch, request } = fixture({
      category: { type: 'choice', choice: 'billing' },
      urgent: { type: 'noul', noul: 0.7 },
    })
    const classify = custom.matcher({
      category: z.enum(['billing', 'technical']).describe('Which team should handle this?'),
      urgent: z.boolean().describe('Does this require immediate attention?'),
    })
    const ticket = { message: 'Charged twice' }
    const result = classify({ threshold: 0.8 })`for ${ticket}`
    expectTypeOf(result).toEqualTypeOf<
      Promise<{ category: 'billing' | 'technical'; urgent: boolean }>
    >()
    await expect(result).resolves.toEqual({ category: 'billing', urgent: false })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(request()).toMatchObject({
      state: { arg0: ticket },
      questions: {
        category: { type: 'choice', instructions: 'for `arg0`\n\nWhich team should handle this?' },
        urgent: {
          type: 'noul',
          instructions: 'for `arg0`\n\nDoes this require immediate attention?',
        },
      },
    })
    await expect(classify`next ticket`).resolves.toEqual({ category: 'billing', urgent: true })
    expect(request(1).state).toEqual({})
  })

  it('derives field questions when descriptions are absent and honors instance thresholds', async () => {
    const { custom, request } = fixture(
      {
        urgent: { type: 'noul', noul: 0.7 },
        category: { type: 'choice', choice: 'a' },
      },
      0.8,
    )
    const classify = custom.matcher({ urgent: mini.boolean(), category: mini.enum(['a', 'b']) })
    await expect(classify`ticket`).resolves.toEqual({ urgent: false, category: 'a' })
    expect(request().questions).toMatchObject({
      urgent: { instructions: 'ticket\n\nIs urgent true?' },
      category: { instructions: 'ticket\n\nWhich category best matches?' },
    })
  })

  it('rejects empty shapes, unsupported fields, and missing answers', async () => {
    const { custom, fetch } = fixture({ urgent: { type: 'noul', noul: 0.9 } })
    expect(() => custom.matcher({})).toThrow('at least one field')
    // @ts-expect-error Scores need explicit semantic support before numeric schemas are allowed.
    expect(() => custom.matcher({ score: z.number() })).toThrow('Unsupported schema for "score"')
    // @ts-expect-error Optional schemas are outside the supported mappings.
    expect(() => custom.matcher({ urgent: z.boolean().optional() })).toThrow('Unsupported schema')
    expect(fetch).not.toHaveBeenCalled()
    await expect(
      custom.matcher({ urgent: z.boolean(), category: z.enum(['a']) })`ticket`,
    ).rejects.toThrow('Missing answer for "category"')
  })

  it('safely preserves special field names and enum labels', async () => {
    const answers = Object.fromEntries([
      ['__proto__', { type: 'choice', choice: '__proto__' }],
      ['constructor', { type: 'noul', noul: 0.9 }],
    ])
    const { custom, request } = fixture(answers)
    const shape = { ['__proto__']: z.enum(['__proto__', 'other']), constructor: z.boolean() }
    const result = await custom.matcher(shape)`context`
    expect(Object.hasOwn(result, '__proto__')).toBe(true)
    expect(Object.getOwnPropertyDescriptor(result, '__proto__')?.value).toBe('__proto__')
    expect(result.constructor).toBe(true)
    const question = Object.getOwnPropertyDescriptor(request().questions, '__proto__')?.value
    expect(Object.keys(question.criteria)).toEqual(['__proto__', 'other'])
  })

  it('uses current global configuration for reusable matchers and keeps instances independent', async () => {
    const { custom, fetch } = fixture({ decision: { type: 'noul', noul: 0.9 } })
    const classify = decide.matcher({ urgent: z.boolean() })
    decide.configure({
      apiKey: 'test-key',
      fetch: async () => Response.json({ answers: { urgent: { type: 'noul', noul: 0.9 } } }),
    })
    await expect(classify`context`).resolves.toEqual({ urgent: true })
    decide.configure({ apiKey: 'test-key', fetch, threshold: 1 })
    await expect(decide.yes`context`).resolves.toBe(false)
    await expect(custom.yes`context`).resolves.toBe(true)
    expect(custom).not.toHaveProperty('configure')
  })
})
