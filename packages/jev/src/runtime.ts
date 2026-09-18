import type { Question, TypeSafeClientConfig } from '@typesafe-ai/sdk'
import { TypeSafeClient } from '@typesafe-ai/sdk'
import type { $ZodBoolean, output } from 'zod/v4/core'
import { parseAsync } from 'zod/v4/core'
import { readChoice, readProbability } from './answers'
import type { DecisionQuestion, EnumSchema, MatcherResult, MatcherShape } from './schema'
import { compileArrayItemSchema, compileFieldSchema } from './schema'
import type { DecisionOptions, DecisionTag } from './tag'
import { createTag, resolveThreshold } from './tag'
import { compileTemplate } from './template'

export interface DeciderOptions {
  /**
   * SDK client or construction options.
   * Omit to use SDK defaults, including `TYPESAFE_API_KEY`.
   */
  client?: TypeSafeClient | TypeSafeClientConfig
  /**
   * Default boolean threshold in [0, 1]. Defaults to 0.5.
   * A probability at or above the threshold is true; lower values are false.
   */
  threshold?: number
}

export class DecisionRuntime {
  private current?: {
    threshold: number
    client: TypeSafeClient
  }

  readonly yes = createTag(async (strings, values, options) => {
    const { p, threshold } = await this.probability(strings, values, options)
    return p >= threshold
  })

  readonly no = createTag(async (strings, values, options) => {
    const { p, threshold } = await this.probability(strings, values, options)
    return p < threshold
  })

  readonly match = <Schema extends EnumSchema>(schema: Schema) => {
    const question = compileFieldSchema(schema, 'option')
    if (question.type !== 'choice') throw new TypeError('match requires a Zod string enum')

    return createTag<output<Schema>>(async (strings, values, options) => {
      const { answers } = await this.evaluate(strings, values, { decision: question }, options)
      return parseAsync(schema, readChoice(answers, 'decision', question.options))
    })
  }

  readonly matcher = <const Shape extends MatcherShape>(shape: Shape) => {
    return (
      Array.isArray(shape)
        ? this.arrayMatcher(shape)
        : this.objectMatcher(shape as Record<string, EnumSchema | $ZodBoolean>)
    ) as DecisionTag<MatcherResult<Shape>>
  }

  constructor(options?: DeciderOptions) {
    if (options !== undefined) this.configure(options)
  }

  configure({ threshold, client }: DeciderOptions) {
    this.current = {
      threshold: resolveThreshold(threshold),
      client: client instanceof TypeSafeClient ? client : new TypeSafeClient(client),
    }
  }

  private arrayMatcher(schemas: readonly (EnumSchema | $ZodBoolean)[]) {
    if (schemas.length === 0) throw new TypeError('matcher requires at least one field')
    const fields = Array.from(schemas, (schema, index) => ({
      name: String(index),
      schema,
      question: compileArrayItemSchema(schema, index),
    }))
    const questions = Object.fromEntries(fields.map(({ name, question }) => [name, question]))

    return createTag(async (strings, values, options) => {
      const { answers, threshold } = await this.evaluate(strings, values, questions, options)
      return Promise.all(
        fields.map(async ({ name, schema, question }) => {
          const value =
            question.type === 'noul'
              ? readProbability(answers, name) >= threshold
              : readChoice(answers, name, question.options)
          return parseAsync(schema, value)
        }),
      )
    })
  }

  private objectMatcher(shape: Record<string, EnumSchema | $ZodBoolean>) {
    const fields = Object.entries(shape).map(([name, schema]) => ({
      name,
      schema,
      question: compileFieldSchema(schema, name),
    }))
    if (fields.length === 0) throw new TypeError('matcher requires at least one field')
    const questions = Object.fromEntries(fields.map(({ name, question }) => [name, question]))

    return createTag(async (strings, values, options) => {
      const { answers, threshold } = await this.evaluate(strings, values, questions, options)
      const entries = await Promise.all(
        fields.map(async ({ name, schema, question }) => {
          const value =
            question.type === 'noul'
              ? readProbability(answers, name) >= threshold
              : readChoice(answers, name, question.options)
          return [name, await parseAsync(schema, value)] as const
        }),
      )
      return Object.fromEntries(entries)
    })
  }

  private async probability(
    strings: TemplateStringsArray,
    values: unknown[],
    options: DecisionOptions,
  ) {
    const { answers, threshold } = await this.evaluate(
      strings,
      values,
      { decision: { type: 'noul', instructions: '' } },
      options,
    )
    return { p: readProbability(answers, 'decision'), threshold }
  }

  private async evaluate(
    strings: TemplateStringsArray,
    values: unknown[],
    questions: Record<string, DecisionQuestion>,
    options: DecisionOptions,
  ) {
    const { state, instructions } = compileTemplate(strings, values)
    const current = this.current
    if (!current) {
      throw new Error('Call decide.configure(...) before evaluating a global decision')
    }

    const threshold = resolveThreshold(options.threshold ?? current.threshold)
    const compiled = Object.fromEntries(
      Object.entries(questions).map(([id, question]): [string, Question] => {
        const framed = [instructions, question.instructions].filter(Boolean).join('\n\n')
        return [
          id,
          question.type === 'noul'
            ? { type: 'noul', instructions: framed }
            : {
                type: 'choice',
                instructions: framed,
                criteria: Object.fromEntries(question.options.map((option) => [option, null])),
              },
        ]
      }),
    )
    const { answers } = await current.client.systemOne(
      { state, questions: compiled, model: options.model },
      { signal: options.signal },
    )
    return { answers, threshold }
  }
}
