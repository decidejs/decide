import { TypeSafeClient } from '@typesafe-ai/sdk'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { z } from 'zod'
import * as mini from 'zod/mini'
import { DecisionRuntime } from './runtime'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function response(noul: unknown) {
  return vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () =>
    Response.json({ answers: { decision: { type: 'noul', noul } } }),
  )
}

describe('client configuration', () => {
  it('retains an existing client and invokes it with its receiver', async () => {
    const client = new TypeSafeClient({ apiKey: 'test-key', fetch: response(0.9) })
    const systemOne = vi.spyOn(client, 'systemOne')
    vi.stubEnv('TYPESAFE_API_KEY', '')
    const runtime = new DecisionRuntime({ client })
    await expect(runtime.yes`valid?`).resolves.toBe(true)
    expect(systemOne).toHaveBeenCalledTimes(1)
  })

  it('constructs the client during configuration without retaining its options', async () => {
    const fetch = response(0.9)
    const options = { apiKey: 'test-key', fetch }
    const runtime = new DecisionRuntime({ client: options })
    options.fetch = response(0.1)
    await expect(runtime.yes`valid?`).resolves.toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(options.fetch).not.toHaveBeenCalled()
  })

  it('rejects invalid client options during setup and preserves an existing configuration', async () => {
    const runtime = new DecisionRuntime({ client: { apiKey: 'test-key', fetch: response(0.7) } })
    expect(() =>
      runtime.configure({
        client: { apiKey: 'test-key', timeout: 0 },
        threshold: 0.8,
      }),
    ).toThrow()
    await expect(runtime.yes`valid?`).resolves.toBe(true)

    vi.stubEnv('TYPESAFE_API_KEY', '')
    expect(() => new DecisionRuntime({ client: {} })).toThrow('API key')
  })
})

describe('boolean decisions', () => {
  it('requires configuration before evaluation', async () => {
    const runtime = new DecisionRuntime()
    await expect(runtime.yes`is this valid?`).rejects.toThrow('decide.configure')
  })

  it.each([
    [0, false, true],
    [0.49, false, true],
    [0.5, true, false],
    [0.51, true, false],
    [1, true, false],
  ])('projects probability %s into complementary default predicates', async (p, yes, no) => {
    const custom = new DecisionRuntime({ client: { apiKey: 'test-key', fetch: response(p) } })
    await expect(custom.yes`valid?`).resolves.toBe(yes)
    await expect(custom.no`valid?`).resolves.toBe(no)
  })

  it.each([
    [0.2, false, true],
    [0.3, false, true],
    [0.5, false, true],
    [0.7, false, true],
    [0.8, true, false],
  ])(
    'keeps predicates complementary at a high threshold for probability %s',
    async (p, yes, no) => {
      const custom = new DecisionRuntime({
        client: { apiKey: 'test-key', fetch: response(p) },
        threshold: 0.8,
      })
      await expect(custom.yes`valid?`).resolves.toBe(yes)
      await expect(custom.no`valid?`).resolves.toBe(no)
    },
  )

  it.each([
    [0.1, false, true],
    [0.25, true, false],
    [0.5, true, false],
    [0.75, true, false],
    [0.9, true, false],
  ])('keeps predicates complementary at a low threshold for probability %s', async (p, yes, no) => {
    const runtime = new DecisionRuntime({
      client: { apiKey: 'test-key', fetch: response(p) },
      threshold: 0.25,
    })
    await expect(runtime.yes`valid?`).resolves.toBe(yes)
    await expect(runtime.no`valid?`).resolves.toBe(no)
  })

  it.each([
    [0, 0, true, false],
    [0, 0.5, true, false],
    [0, 1, true, false],
    [1, 0, false, true],
    [1, 0.5, false, true],
    [1, 1, true, false],
  ])('supports threshold %s at probability %s', async (threshold, p, yes, no) => {
    const runtime = new DecisionRuntime({
      client: { apiKey: 'test-key', fetch: response(p) },
      threshold,
    })
    await expect(runtime.yes`valid?`).resolves.toBe(yes)
    await expect(runtime.no`valid?`).resolves.toBe(no)
  })

  it('accepts weak signals through predicate and matcher overrides', async () => {
    const { custom } = fixture({
      decision: { type: 'noul', noul: 0.05 },
      urgent: { type: 'noul', noul: 0.05 },
    })
    await expect(custom.yes({ threshold: 0.01 })`any signal?`).resolves.toBe(true)
    await expect(custom.no({ threshold: 0.01 })`any signal?`).resolves.toBe(false)
    await expect(custom.yes`any signal?`).resolves.toBe(false)
    await expect(custom.no`any signal?`).resolves.toBe(true)
    const classify = custom.matcher({ urgent: z.boolean() })
    await expect(classify({ threshold: 0.01 })`ticket`).resolves.toEqual({ urgent: true })
    await expect(classify`ticket`).resolves.toEqual({ urgent: false })
  })

  it('supports reusable per-call options without changing instance defaults', async () => {
    const custom = new DecisionRuntime({ client: { apiKey: 'test-key', fetch: response(0.7) } })
    const strict = custom.yes({ threshold: 0.8 })
    const result = strict`valid?`
    await expect(result).resolves.toBe(false)
    await expect(custom.yes`valid?`).resolves.toBe(true)
    await expect(strict({ threshold: 0.6 })`valid?`).resolves.toBe(true)
    await expect(strict`valid?`).resolves.toBe(false)
    expectTypeOf(result).toEqualTypeOf<Promise<boolean>>()
  })

  it('passes structured state and instance and per-call SDK configuration', async () => {
    const fetch = response(0.9)
    const custom = new DecisionRuntime({
      client: {
        apiKey: 'test-key',
        baseURL: 'https://example.test',
        defaultModel: 'configured-model',
        defaultHeaders: { 'x-example': 'configured' },
        fetch,
      },
    })
    const value = { tags: ['a', 'b'] }
    await custom.yes`is ${value} valid?`
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://example.test/v1/systemone')
    expect(new Headers(init?.headers).get('x-example')).toBe('configured')
    expect(JSON.parse(init?.body as string)).toEqual({
      model: 'configured-model',
      state: { arg0: value },
      questions: { decision: { type: 'noul', instructions: 'is `arg0` valid?' } },
    })
    await custom.yes({ model: 'override-model' })`valid?`
    const [, override] = fetch.mock.calls[1]
    expect(JSON.parse(override?.body as string).model).toBe('override-model')
  })

  it('reconfigures without changing independent runtimes or existing tags', async () => {
    const runtime = new DecisionRuntime()
    const positive = response(0.7)
    const negative = response(0.1)
    const instance = new DecisionRuntime({ client: { apiKey: 'test-key', fetch: positive } })
    const { yes, no } = runtime
    const strict = yes({ threshold: 0.8 })
    runtime.configure({ client: { apiKey: 'test-key', fetch: positive } })
    await expect(yes`valid?`).resolves.toBe(true)
    await expect(no`valid?`).resolves.toBe(false)
    await expect(strict`valid?`).resolves.toBe(false)
    runtime.configure({ client: { apiKey: 'test-key', fetch: negative } })
    await expect(yes`valid?`).resolves.toBe(false)
    await expect(no`valid?`).resolves.toBe(true)
    await expect(instance.yes`valid?`).resolves.toBe(true)
  })

  it('supports destructuring predicate properties', async () => {
    const { yes, no } = new DecisionRuntime({
      client: { apiKey: 'test-key', fetch: response(0.7) },
    })
    await expect(yes`valid?`).resolves.toBe(true)
    await expect(no`valid?`).resolves.toBe(false)
    await expect(yes({ threshold: 0.8 })`valid?`).resolves.toBe(false)
  })

  it('supports SDK environment configuration', async () => {
    const runtime = new DecisionRuntime()
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key')
    vi.stubGlobal('fetch', response(0.9))
    runtime.configure({})
    await expect(runtime.yes`valid?`).resolves.toBe(true)
  })

  it.each([-1, -0.01, 1.1, Number.NaN, Infinity])(
    'rejects invalid thresholds before sending a request: %s',
    (threshold) => {
      expect(() => new DecisionRuntime({ threshold })).toThrow(RangeError)
      const fetch = response(0.7)
      const runtime = new DecisionRuntime({ client: { apiKey: 'test-key', fetch } })
      const tags = [
        runtime.yes,
        runtime.no,
        runtime.match(z.enum(['a', 'b'])),
        runtime.matcher({ urgent: z.boolean() }),
        runtime.matcher([z.boolean().describe('Is this urgent?')]),
      ]
      for (const tag of tags) {
        expect(() => tag({ threshold })).toThrow(RangeError)
      }
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it.each([undefined, '0.8', -0.1, 1.1, null])('rejects invalid probabilities: %s', async (p) => {
    const custom = new DecisionRuntime({ client: { apiKey: 'test-key', fetch: response(p) } })
    await expect(custom.yes`valid?`).rejects.toThrow('Invalid Noul probability')
  })

  it('propagates SDK errors and per-call cancellation', async () => {
    const fetch = vi.fn(async (_input: string, init?: RequestInit) => {
      init?.signal?.throwIfAborted()
      return new Response('unauthorized', { status: 401 })
    })
    const custom = new DecisionRuntime({ client: { apiKey: 'test-key', fetch } })
    await expect(custom.yes`valid?`).rejects.toMatchObject({ status: 401 })
    fetch.mockClear()
    await expect(custom.yes({ signal: AbortSignal.abort() })`valid?`).rejects.toMatchObject({
      name: 'APIUserAbortError',
    })
  })
})

function fixture(answers: unknown, threshold?: number) {
  const fetch = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () =>
    Response.json({ answers }),
  )
  return {
    fetch,
    custom: new DecisionRuntime({ client: { apiKey: 'test-key', fetch }, threshold }),
    request: (index = 0) => JSON.parse(fetch.mock.calls[index][1]?.body as string),
  }
}

describe('enum matching', () => {
  it('supports destructuring matching properties', async () => {
    const { custom } = fixture({
      decision: { type: 'choice', choice: 'a' },
      urgent: { type: 'noul', noul: 0.7 },
    })
    const { match, matcher } = custom
    await expect(match(z.enum(['a', 'b']))`classify`).resolves.toBe('a')
    const classify = matcher({ urgent: z.boolean() })
    await expect(classify`ticket`).resolves.toEqual({ urgent: true })
    await expect(classify({ threshold: 0.8 })`ticket`).resolves.toEqual({ urgent: false })
  })

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
  it('evaluates array questions in one request and preserves tuple order and types', async () => {
    const { custom, fetch, request } = fixture({
      1: { type: 'noul', noul: 0.7 },
      0: { type: 'choice', choice: 'billing' },
    })
    const classify = custom.matcher([
      z.enum(['billing', 'technical']).describe('Which team should handle this?'),
      z.boolean().describe('Does this require immediate attention?'),
    ])
    const ticket = { message: 'Charged twice' }
    const result = classify({ threshold: 0.8 })`for ${ticket}`
    expectTypeOf(result).toEqualTypeOf<Promise<['billing' | 'technical', boolean]>>()
    await expect(result).resolves.toEqual(['billing', false])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(request()).toMatchObject({
      state: { arg0: ticket },
      questions: {
        0: { type: 'choice', instructions: 'for `arg0`\n\nWhich team should handle this?' },
        1: { type: 'noul', instructions: 'for `arg0`\n\nDoes this require immediate attention?' },
      },
    })
    await expect(classify`next ticket`).resolves.toEqual(['billing', true])
  })

  it('supports dynamic arrays and readonly tuples with registered Mini descriptions', async () => {
    const { custom } = fixture({
      0: { type: 'noul', noul: 0.5 },
      1: { type: 'noul', noul: 0.4 },
    })
    const schemas = ['Is this urgent?', 'Is this spam?'].map((question) =>
      z.boolean().describe(question),
    )
    const result = custom.matcher(schemas)`ticket`
    expectTypeOf(result).toEqualTypeOf<Promise<boolean[]>>()
    await expect(result).resolves.toEqual([true, false])
    const tuple = [
      mini.boolean().register(z.globalRegistry, { description: 'Is this urgent?' }),
    ] as const
    const tupleResult = custom.matcher(tuple)`ticket`
    expectTypeOf(tupleResult).toEqualTypeOf<Promise<[boolean]>>()
    await expect(tupleResult).resolves.toEqual([true])
  })

  it.each([undefined, '', ' \n\t '])(
    'rejects array descriptions before sending a request: %s',
    (description) => {
      const { custom, fetch } = fixture({})
      const schema = description === undefined ? z.boolean() : z.boolean().describe(description)
      expect(() => custom.matcher([z.boolean().describe('Valid question?'), schema])).toThrow(
        'Array schema at index 1 requires a nonempty description',
      )
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it('rejects empty arrays and unsupported array schemas before sending a request', () => {
    const { custom, fetch } = fixture({})
    expect(() => custom.matcher([])).toThrow('at least one field')
    // @ts-expect-error Arrays support only boolean and string enum schemas.
    expect(() => custom.matcher([z.string().describe('What is this?')])).toThrow(
      'Unsupported schema',
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects missing array answers and applies async schema refinements', async () => {
    const { custom } = fixture({ 0: { type: 'noul', noul: 0.9 } })
    await expect(
      custom.matcher([
        z.boolean().describe('Is this urgent?'),
        z.boolean().describe('Is this spam?'),
      ])`ticket`,
    ).rejects.toThrow('Missing answer for "1"')
    const schema = z
      .boolean()
      .refine(async (value) => !value, 'Must be false')
      .describe('Is this spam?')
    await expect(custom.matcher([schema])`ticket`).rejects.toThrow('Must be false')
  })

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

  it('uses current configuration for reusable matchers and keeps runtimes independent', async () => {
    const runtime = new DecisionRuntime()
    const { custom, fetch } = fixture({ decision: { type: 'noul', noul: 0.9 } })
    const classify = runtime.matcher({ urgent: z.boolean() })
    runtime.configure({
      client: {
        apiKey: 'test-key',
        fetch: async () => Response.json({ answers: { urgent: { type: 'noul', noul: 0.9 } } }),
      },
    })
    await expect(classify`context`).resolves.toEqual({ urgent: true })
    runtime.configure({ client: { apiKey: 'test-key', fetch }, threshold: 1 })
    await expect(runtime.yes`context`).resolves.toBe(false)
    await expect(custom.yes`context`).resolves.toBe(true)
  })
})
