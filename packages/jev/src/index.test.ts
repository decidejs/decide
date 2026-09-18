import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import type { Decisions } from './index'
import { createDecider, decide } from './index'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function response(noul: unknown) {
  return vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(async () =>
    Response.json({ answers: { decision: { type: 'noul', noul } } }),
  )
}

describe('boolean decisions', () => {
  it('requires configuration for global decisions, but not for importing', async () => {
    await expect(decide.yes`is this valid?`).rejects.toThrow('decide.configure')
  })

  it.each([
    [0, false, true],
    [0.49, false, true],
    [0.5, true, false],
    [0.51, true, false],
    [1, true, false],
  ])('projects probability %s into complementary default predicates', async (p, yes, no) => {
    const custom = createDecider({ apiKey: 'test-key', fetch: response(p) })
    await expect(custom.yes`valid?`).resolves.toBe(yes)
    await expect(custom.no`valid?`).resolves.toBe(no)
  })

  it.each([
    [0.2, false, true],
    [0.3, false, false],
    [0.5, false, false],
    [0.7, false, false],
    [0.8, true, false],
  ])('preserves an uncertainty band at probability %s', async (p, yes, no) => {
    const custom = createDecider({ apiKey: 'test-key', threshold: 0.8, fetch: response(p) })
    await expect(custom.yes`valid?`).resolves.toBe(yes)
    await expect(custom.no`valid?`).resolves.toBe(no)
  })

  it('supports reusable per-call options without changing instance defaults', async () => {
    const custom = createDecider({ apiKey: 'test-key', fetch: response(0.7) })
    const strict = custom.yes({ threshold: 0.8 })
    const result = strict`valid?`
    await expect(result).resolves.toBe(false)
    await expect(custom.yes`valid?`).resolves.toBe(true)
    await expect(strict({ threshold: 0.6 })`valid?`).resolves.toBe(true)
    await expect(strict`valid?`).resolves.toBe(false)
    expectTypeOf(result).toEqualTypeOf<Promise<boolean>>()
    expectTypeOf<ReturnType<typeof createDecider>>().toExtend<Decisions>()
    expect(custom).not.toHaveProperty('configure')
  })

  it('passes structured state and instance and per-call SDK configuration', async () => {
    const fetch = response(0.9)
    const custom = createDecider({
      apiKey: 'test-key',
      baseURL: 'https://example.test',
      defaultModel: 'configured-model',
      defaultHeaders: { 'x-example': 'configured' },
      fetch,
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

  it('configures and reconfigures the global independently of instances', async () => {
    const positive = response(0.7)
    const negative = response(0.1)
    const instance = createDecider({ apiKey: 'test-key', fetch: positive })
    const { configure, yes, no } = decide
    const strict = yes({ threshold: 0.8 })
    configure({ apiKey: 'test-key', fetch: positive })
    await expect(yes`valid?`).resolves.toBe(true)
    await expect(no`valid?`).resolves.toBe(false)
    await expect(strict`valid?`).resolves.toBe(false)
    configure({ apiKey: 'test-key', fetch: negative })
    await expect(yes`valid?`).resolves.toBe(false)
    await expect(no`valid?`).resolves.toBe(true)
    await expect(instance.yes`valid?`).resolves.toBe(true)
  })

  it('supports destructuring predicates from independent deciders', async () => {
    const { yes, no } = createDecider({ apiKey: 'test-key', fetch: response(0.7) })
    await expect(yes`valid?`).resolves.toBe(true)
    await expect(no`valid?`).resolves.toBe(false)
    await expect(yes({ threshold: 0.8 })`valid?`).resolves.toBe(false)
  })

  it('supports SDK environment configuration after explicitly configuring the global', async () => {
    vi.stubEnv('TYPESAFE_API_KEY', 'test-key')
    vi.stubGlobal('fetch', response(0.9))
    decide.configure({})
    await expect(decide.yes`valid?`).resolves.toBe(true)
  })

  it.each([-1, 0.4, 1.1, Number.NaN, Infinity])('rejects invalid thresholds: %s', (threshold) => {
    expect(() => createDecider({ threshold })).toThrow(RangeError)
    expect(() => decide.yes({ threshold })).toThrow(RangeError)
  })

  it.each([undefined, '0.8', -0.1, 1.1, null])('rejects invalid probabilities: %s', async (p) => {
    const custom = createDecider({ apiKey: 'test-key', fetch: response(p) })
    await expect(custom.yes`valid?`).rejects.toThrow('Invalid Noul probability')
  })

  it('propagates SDK errors and per-call cancellation', async () => {
    const fetch = vi.fn(async (_input: string, init?: RequestInit) => {
      init?.signal?.throwIfAborted()
      return new Response('unauthorized', { status: 401 })
    })
    const custom = createDecider({ apiKey: 'test-key', fetch })
    await expect(custom.yes`valid?`).rejects.toMatchObject({ status: 401 })
    fetch.mockClear()
    await expect(custom.yes({ signal: AbortSignal.abort() })`valid?`).rejects.toMatchObject({
      name: 'APIUserAbortError',
    })
  })
})
